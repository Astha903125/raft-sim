#include "raft_node.h"
#include <algorithm>
#include <iostream>
#include <chrono>

using namespace std::chrono;
using ms = std::chrono::milliseconds;

static constexpr int HEARTBEAT_MS       = 150;
static constexpr int ELECTION_TIMEOUT_MIN = 500;
static constexpr int ELECTION_TIMEOUT_MAX = 1500;

// ── Construction / Destruction ───────────────────────────────────────────────

RaftNode::RaftNode(int id, EventCallback eventCb, StateCallback stateCb)
    : id_(id), eventCb_(std::move(eventCb)), stateCb_(std::move(stateCb)),
      rng_(std::random_device{}())
{
    electionTimeoutMs_ = randomTimeout();
    lastHeartbeat_     = steady_clock::now();
}

RaftNode::~RaftNode() { stop(); }

// ── Lifecycle ────────────────────────────────────────────────────────────────

void RaftNode::start() {
    alive_   = true;
    running_ = true;
    lastHeartbeat_ = steady_clock::now();
    timerThread_ = std::thread(&RaftNode::timerLoop, this);
}

void RaftNode::stop() {
    running_ = false;
    cv_.notify_all();
    if (timerThread_.joinable()) timerThread_.join();
}

void RaftNode::crash() {
    std::lock_guard<std::mutex> lk(mu_);
    alive_ = false;
    role_  = RaftRole::Follower;
    emit({ "CRASH", id_, id_, currentTerm_, "" });
    notifyState();
}

void RaftNode::revive() {
    std::lock_guard<std::mutex> lk(mu_);
    alive_    = true;
    role_     = RaftRole::Follower;
    votedFor_ = -1;
    resetElectionTimeout();
    emit({ "REVIVE", id_, id_, currentTerm_, "" });
    notifyState();
}

// ── Cluster wiring ───────────────────────────────────────────────────────────

void RaftNode::setPeers(std::vector<RaftNode*> peers) {
    std::lock_guard<std::mutex> lk(mu_);
    peers_ = std::move(peers);
    int n  = (int)peers_.size() + 1;
    nextIndex_.assign(n, 0);
    matchIndex_.assign(n, -1);
}

// ── Timer loop ───────────────────────────────────────────────────────────────

void RaftNode::timerLoop() {
    while (running_) {
        std::this_thread::sleep_for(ms(10));
        std::lock_guard<std::mutex> lk(mu_);
        if (!alive_) continue;

        if (role_ == RaftRole::Leader) {
            auto elapsed = duration_cast<ms>(steady_clock::now() - lastHeartbeat_).count();
            if (elapsed >= HEARTBEAT_MS) {
                lastHeartbeat_ = steady_clock::now();
                // unlock before sending (peers may lock themselves)
                mu_.unlock();
                sendHeartbeats();
                mu_.lock();
            }
        } else {
            auto elapsed = duration_cast<ms>(steady_clock::now() - lastHeartbeat_).count();
            if (elapsed >= electionTimeoutMs_) {
                mu_.unlock();
                startElection();
                mu_.lock();
            }
        }
    }
}

// ── Election ─────────────────────────────────────────────────────────────────

void RaftNode::startElection() {
    {
        std::lock_guard<std::mutex> lk(mu_);
        if (!alive_) return;
        currentTerm_++;
        role_     = RaftRole::Candidate;
        votedFor_ = id_;
        resetElectionTimeout();
        emit({ "RV", id_, -1, currentTerm_, "" });
        notifyState();
    }

    int votes  = 1;
    int totalNodes = (int)peers_.size() + 1;  // peers + self
    int needed = (totalNodes / 2) + 1;   
    //int needed = ((int)peers_.size() + 2) / 2;  // majority of total cluster

    RequestVoteArgs args;
    {
        std::lock_guard<std::mutex> lk(mu_);
        args = { currentTerm_, id_, lastLogIndex(), lastLogTerm() };
    }

    for (auto* peer : peers_) {
        if (!peer) continue;
        auto reply = peer->handleRequestVote(args);

        std::lock_guard<std::mutex> lk(mu_);
        if (!alive_ || role_ != RaftRole::Candidate) return;

        if (reply.term > currentTerm_) {
            becomeFollower(reply.term);
            return;
        }
        if (reply.voteGranted) {
            votes++;
            emit({ "VOTE_GRANTED", peer->id_, id_, currentTerm_, "" });
        }
        if (votes >= needed + 1) {
            becomeLeader();
            return;
        }
    }
}

void RaftNode::becomeLeader() {
    // called with lock held
    role_     = RaftRole::Leader;
    leaderId_ = id_;
    int n     = (int)peers_.size() + 1;
    nextIndex_.assign(n, lastLogIndex() + 1);
    matchIndex_.assign(n, -1);
    emit({ "ELECTED", id_, id_, currentTerm_, "" });
    notifyState();
}

void RaftNode::becomeFollower(int term) {
    // called with lock held
    currentTerm_ = term;
    role_        = RaftRole::Follower;
    votedFor_    = -1;
    resetElectionTimeout();
    notifyState();
}

// ── Heartbeats / AppendEntries ────────────────────────────────────────────────

void RaftNode::sendHeartbeats() {
    std::vector<RaftNode*> peersCopy;
    int term, leaderId, leaderCommit, myLastIdx;
    {
        std::lock_guard<std::mutex> lk(mu_);
        if (!alive_ || role_ != RaftRole::Leader) return;
        peersCopy   = peers_;
        term        = currentTerm_;
        leaderId    = id_;
        leaderCommit = commitIndex_;
        myLastIdx   = lastLogIndex();
    }

    for (auto* peer : peersCopy) {
        if (!peer) continue;

        AppendEntriesArgs args;
        std::vector<LogEntry> entries;
        {
            std::lock_guard<std::mutex> lk(mu_);
            int ni = nextIndex_[peer->id_];
            int prevIdx  = ni - 1;
            int prevTerm = (prevIdx >= 0 && prevIdx < (int)log_.size()) ? log_[prevIdx].term : 0;

            // replicate missing entries
            for (int i = ni; i <= lastLogIndex(); i++) {
                if (i >= 0 && i < (int)log_.size()) entries.push_back(log_[i]);
            }
            args = { term, leaderId, prevIdx, prevTerm, entries, leaderCommit };
        }

        bool isHB = entries.empty();
        emit({ isHB ? "HB" : "AE", id_, peer->id_, term, "" });

        auto reply = peer->handleAppendEntries(args);

        {
            std::lock_guard<std::mutex> lk(mu_);
            if (!alive_ || role_ != RaftRole::Leader) return;
            if (reply.term > currentTerm_) { becomeFollower(reply.term); return; }

            if (reply.success && !entries.empty()) {
                int newMatch = args.prevLogIndex + (int)entries.size();
                matchIndex_[peer->id_] = std::max(matchIndex_[peer->id_], newMatch);
                nextIndex_[peer->id_]  = matchIndex_[peer->id_] + 1;
                emit({ "ACK", peer->id_, id_, term, "" });
                tryCommit();
            } else if (!reply.success) {
                if (nextIndex_[peer->id_] > 0) nextIndex_[peer->id_]--;
            }
        }
    }
}

// ── RPC Handlers ─────────────────────────────────────────────────────────────

RequestVoteReply RaftNode::handleRequestVote(const RequestVoteArgs& args) {
    std::lock_guard<std::mutex> lk(mu_);
    RequestVoteReply reply { currentTerm_, false };
    if (!alive_) return reply;

    if (args.term < currentTerm_) return reply;
    if (args.term > currentTerm_) becomeFollower(args.term);

    bool canVote = (votedFor_ == -1 || votedFor_ == args.candidateId);
    bool logOk   = isLogUpToDate(args.lastLogIndex, args.lastLogTerm);

    if (canVote && logOk) {
        votedFor_ = args.candidateId;
        resetElectionTimeout();
        reply.voteGranted = true;
    }
    reply.term = currentTerm_;
    return reply;
}

AppendEntriesReply RaftNode::handleAppendEntries(const AppendEntriesArgs& args) {
    std::lock_guard<std::mutex> lk(mu_);
    AppendEntriesReply reply { currentTerm_, false };
    if (!alive_) return reply;

    if (args.term < currentTerm_) return reply;
    if (args.term > currentTerm_) becomeFollower(args.term);

    resetElectionTimeout();
    leaderId_ = args.leaderId;
    role_     = RaftRole::Follower;

    // consistency check
    if (args.prevLogIndex >= 0) {
        if (args.prevLogIndex >= (int)log_.size()) return reply;
        if (log_[args.prevLogIndex].term != args.prevLogTerm) {
            log_.resize(args.prevLogIndex);
            return reply;
        }
    }

    // append new entries
    for (int i = 0; i < (int)args.entries.size(); i++) {
        int idx = args.prevLogIndex + 1 + i;
        if (idx < (int)log_.size()) {
            if (log_[idx].term != args.entries[i].term) log_.resize(idx);
            else continue;
        }
        log_.push_back(args.entries[i]);
    }

    // advance commit
    if (args.leaderCommit > commitIndex_) {
        commitIndex_ = std::min(args.leaderCommit, lastLogIndex());
        for (int i = 0; i <= commitIndex_ && i < (int)log_.size(); i++)
            log_[i].committed = true;
    }

    reply.success = true;
    reply.term    = currentTerm_;
    //notifyState();
    return reply;
}

// ── Client command ────────────────────────────────────────────────────────────

bool RaftNode::appendCommand(const std::string& cmd) {
    std::lock_guard<std::mutex> lk(mu_);
    if (!alive_ || role_ != RaftRole::Leader) return false;
    int idx   = lastLogIndex() + 1;
    log_.push_back({ idx, currentTerm_, cmd, false });
    matchIndex_[id_] = idx;
    notifyState();
    return true;
}

// ── Commit check ─────────────────────────────────────────────────────────────

void RaftNode::tryCommit() {
    // called with lock held
    int n      = (int)peers_.size() + 1;
    int needed = (n / 2) + 1;

    for (int idx = lastLogIndex(); idx > commitIndex_; idx--) {
        if (idx < 0 || idx >= (int)log_.size()) continue;
        if (log_[idx].term != currentTerm_) break;

        int count = 1;
        for (auto* p : peers_) if (p && matchIndex_[p->id_] >= idx) count++;
        if (count >= needed) {
            commitIndex_ = idx;
            for (int i = 0; i <= commitIndex_ && i < (int)log_.size(); i++)
                log_[i].committed = true;
            notifyState();
            break;
        }
    }
}

// ── Snapshot ─────────────────────────────────────────────────────────────────

RaftNode::Snapshot RaftNode::snapshot() const {
    std::lock_guard<std::mutex> lk(mu_);
    return { id_, roleToString(role_), currentTerm_, commitIndex_,
             (int)log_.size(), alive_.load(), log_, votedFor_ };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

void RaftNode::resetElectionTimeout() {
    electionTimeoutMs_ = randomTimeout();
    lastHeartbeat_     = steady_clock::now();
}

int RaftNode::randomTimeout() {
    std::uniform_int_distribution<int> dist(ELECTION_TIMEOUT_MIN, ELECTION_TIMEOUT_MAX);
    return dist(rng_);
}

bool RaftNode::isLogUpToDate(int lastLogIndex, int lastLogTerm) const {
    int myLastTerm  = this->lastLogTerm();
    int myLastIndex = this->lastLogIndex();
    if (lastLogTerm != myLastTerm)  return lastLogTerm > myLastTerm;
    return lastLogIndex >= myLastIndex;
}

int RaftNode::lastLogIndex() const {
    return (int)log_.size() - 1;
}

int RaftNode::lastLogTerm() const {
    return log_.empty() ? 0 : log_.back().term;
}

void RaftNode::emit(const RpcEvent& ev) {
    if (eventCb_) eventCb_(ev);
}

void RaftNode::notifyState() {
   if (!stateCb_) return;
    auto now = steady_clock::now();
    static thread_local steady_clock::time_point lastNotify;
    if (duration_cast<ms>(now - lastNotify).count() < 300) return; // max ~3/sec
    lastNotify = now;
    std::thread([this]() {
        if (stateCb_) stateCb_();
    }).detach();
}
