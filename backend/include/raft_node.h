#pragma once
#include "raft_types.h"
#include <vector>
#include <mutex>
#include <thread>
#include <atomic>
#include <functional>
#include <random>
#include <chrono>
#include <condition_variable>

// Callback fired whenever a loggable RPC event happens.
// The cluster uses this to broadcast state to WebSocket clients.
using EventCallback = std::function<void(const RpcEvent&)>;
using StateCallback = std::function<void()>;  // fired on any state change

class RaftNode {
public:
    // id        : this node's id (0-4)
    // peers     : all other nodes in the cluster (set after construction)
    // eventCb   : called on every RPC with event details
    // stateCb   : called whenever node state changes (role, term, log)
    RaftNode(int id, EventCallback eventCb, StateCallback stateCb);
    ~RaftNode();

    // ── Lifecycle ────────────────────────────────────────────────────────────
    void start();
    void stop();
    void crash();    // simulate crash  — stops timers, drops RPCs
    void revive();   // simulate revive — restarts as follower

    // ── RPCs (called by cluster, routed between nodes) ───────────────────────
    RequestVoteReply  handleRequestVote(const RequestVoteArgs& args);
    AppendEntriesReply handleAppendEntries(const AppendEntriesArgs& args);

    // ── Client command (only leader accepts) ─────────────────────────────────
    bool appendCommand(const std::string& cmd);

    // ── Cluster wiring ───────────────────────────────────────────────────────
    void setPeers(std::vector<RaftNode*> peers);

    // ── Snapshot (read-only, for WebSocket state push) ───────────────────────
    struct Snapshot {
        int                   id;
        std::string           role;
        int                   term;
        int                   commitIndex;
        int                   logSize;
        bool                  alive;
        std::vector<LogEntry> log;
        int                   votedFor;
    };
    Snapshot snapshot() const;

private:
    // ── Persistent state ─────────────────────────────────────────────────────
    int  currentTerm_  = 0;
    int  votedFor_     = -1;
    std::vector<LogEntry> log_;

    // ── Volatile state ───────────────────────────────────────────────────────
    int  commitIndex_  = -1;
    int  lastApplied_  = -1;

    // ── Leader state (reinitialized on election) ──────────────────────────────
    std::vector<int> nextIndex_;
    std::vector<int> matchIndex_;

    // ── Identity ─────────────────────────────────────────────────────────────
    int              id_;
    RaftRole         role_      = RaftRole::Follower;
    int              leaderId_  = -1;
    std::vector<RaftNode*> peers_;

    // ── Concurrency ──────────────────────────────────────────────────────────
    mutable std::mutex      mu_;
    std::condition_variable cv_;
    std::atomic<bool>       running_  {false};
    std::atomic<bool>       alive_    {false};

    // ── Timers ───────────────────────────────────────────────────────────────
    std::thread              timerThread_;
    std::chrono::steady_clock::time_point lastHeartbeat_;
    int                      electionTimeoutMs_;

    // ── RNG for randomized election timeouts ─────────────────────────────────
    std::mt19937             rng_;

    // ── Callbacks ────────────────────────────────────────────────────────────
    EventCallback  eventCb_;
    StateCallback  stateCb_;

    // ── Internal helpers ─────────────────────────────────────────────────────
    void timerLoop();
    void startElection();
    void sendHeartbeats();
    void becomeLeader();
    void becomeFollower(int term);
    void resetElectionTimeout();
    int  randomTimeout();
    bool isLogUpToDate(int lastLogIndex, int lastLogTerm) const;
    void tryCommit();
    void emit(const RpcEvent& ev);
    void notifyState();
    int  lastLogIndex() const;
    int  lastLogTerm()  const;
};
