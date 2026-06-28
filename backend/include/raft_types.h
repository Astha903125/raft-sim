#pragma once
#include <string>
#include <vector>
#include <cstdint>

// ── Node roles ──────────────────────────────────────────────────────────────
enum class RaftRole { Follower, Candidate, Leader };

inline std::string roleToString(RaftRole r) {
    switch(r) {
        case RaftRole::Follower:  return "follower";
        case RaftRole::Candidate: return "candidate";
        case RaftRole::Leader:    return "leader";
    }
    return "unknown";
}

// ── Log entry ────────────────────────────────────────────────────────────────
struct LogEntry {
    int         index;
    int         term;
    std::string command;
    bool        committed = false;
};

// ── RPC: RequestVote ─────────────────────────────────────────────────────────
struct RequestVoteArgs {
    int         term;
    int         candidateId;
    int         lastLogIndex;
    int         lastLogTerm;
};

struct RequestVoteReply {
    int  term;
    bool voteGranted;
};

// ── RPC: AppendEntries (also used as heartbeat when entries is empty) ─────────
struct AppendEntriesArgs {
    int                   term;
    int                   leaderId;
    int                   prevLogIndex;
    int                   prevLogTerm;
    std::vector<LogEntry> entries;       // empty = heartbeat
    int                   leaderCommit;
};

struct AppendEntriesReply {
    int  term;
    bool success;
};

// ── WebSocket broadcast event (sent to frontend) ─────────────────────────────
struct RpcEvent {
    std::string type;      // "HB" | "AE" | "RV" | "ACK" | "VOTE_GRANTED"
    int         fromId;
    int         toId;
    int         term;
    std::string payload;   // optional JSON detail
};
