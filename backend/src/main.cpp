#include "raft_node.h"
#include <crow.h>
#include <crow/websocket.h>
#include <nlohmann/json.hpp>
#include <vector>
#include <memory>
#include <mutex>
#include <set>
#include <iostream>

using json = nlohmann::json;

static const int CLUSTER_SIZE = 5;
static std::vector<std::unique_ptr<RaftNode>> nodes;
static std::set<crow::websocket::connection*> wsClients;
static std::mutex wsMu;
/*
void broadcastJson(const json& j) {
    std::string msg = j.dump();
    std::lock_guard<std::mutex> lk(wsMu);
    for (auto* conn : wsClients) {
        try { conn->send_text(msg); }
        catch (...) {}
    }
}
    */
void broadcastJson(const json& j) {
    std::string msg = j.dump();

    std::cout << "[SEND] " << msg << std::endl;

    std::lock_guard<std::mutex> lk(wsMu);
    for (auto* conn : wsClients) {
        conn->send_text(msg);
    }
}

json snapshotAll() {
    json arr = json::array();
    for (auto& n : nodes) {
        auto s = n->snapshot();
        json logs = json::array();
        for (auto& e : s.log)
            logs.push_back({{"index",e.index},{"term",e.term},
                            {"cmd",e.command},{"committed",e.committed}});
        arr.push_back({
            {"id",     s.id},
            {"role",   s.role},
            {"term",   s.term},
            {"commit", s.commitIndex},
            {"logSize",s.logSize},
            {"alive",  s.alive},
            {"log",    logs}
        });
    }
    return arr;
}

void pushState() {
    broadcastJson({{"type","STATE"},{"nodes", snapshotAll()}});
}

void buildCluster() {
    nodes.clear();
    for (int i = 0; i < CLUSTER_SIZE; i++) {
        auto eventCb = [i](const RpcEvent& ev) {
            broadcastJson({
                {"type",    "RPC"},
                {"rpcType", ev.type},
                {"from",    ev.fromId},
                {"to",      ev.toId},
                {"term",    ev.term}
            });
        };
        auto stateCb = [](){ pushState(); };
        nodes.push_back(std::make_unique<RaftNode>(i, eventCb, stateCb));
    }
    for (int i = 0; i < CLUSTER_SIZE; i++) {
        std::vector<RaftNode*> peers;
        for (int j = 0; j < CLUSTER_SIZE; j++)
            if (j != i) peers.push_back(nodes[j].get());
        nodes[i]->setPeers(peers);
    }
    for (auto& n : nodes) n->start();
    std::cout << "[cluster] 5-node Raft cluster started\n";
}

int main() {
    buildCluster();

    crow::SimpleApp app;
    app.loglevel(crow::LogLevel::Warning);

    CROW_ROUTE(app, "/ws")
        .websocket()
   .onopen([&](crow::websocket::connection& conn) {
    {
        std::lock_guard<std::mutex> lk(wsMu);
        wsClients.insert(&conn);
    }
    std::cout << "[ws] client connected, total=" << wsClients.size() << "\n";
    // Send a simple ping — nodes will push real state via stateCb
    conn.send_text("{\"type\":\"HELLO\"}");
    std::cout << "[ws] hello sent\n";
})
        .onclose([&](crow::websocket::connection& conn,
                     const std::string&) {
            std::lock_guard<std::mutex> lk(wsMu);
            wsClients.erase(&conn);
            std::cout << "[ws] client disconnected\n";
        })
        .onmessage([&](crow::websocket::connection& conn,
                       const std::string& data, bool) {
            std::cout << "[MESSAGE RECEIVED] " << data << std::endl;
            try {
                auto j = json::parse(data);
                std::string action = j.value("action","");

                if (action == "append") {
                    std::string cmd = j.value("cmd","set key=val");
                    bool ok = false;
                    for (auto& n : nodes) {
                        if (n->snapshot().role == "leader"
                            && n->snapshot().alive) {
                            ok = n->appendCommand(cmd);
                            break;
                        }
                    }
                    if (!ok) broadcastJson({{"type","ERROR"},
                                           {"msg","No leader"}});

                } else if (action == "crash") {
                    int id = j.value("id",-1);
                    if (id >= 0 && id < CLUSTER_SIZE)
                        nodes[id]->crash();

                } else if (action == "revive") {
                    int id = j.value("id",-1);
                    if (id >= 0 && id < CLUSTER_SIZE)
                        nodes[id]->revive();

                } else if (action == "election") {
                    for (auto& n : nodes) {
                        auto s = n->snapshot();
                        if (s.role == "leader" && s.alive) {
                            n->crash();
                            std::this_thread::sleep_for(
                                std::chrono::milliseconds(50));
                            n->revive();
                            break;
                        }
                    }

                } else if (action == "reset") {
                    for (auto& n : nodes) n->stop();
                    buildCluster();
                    pushState();

                } else if (action == "getState") {
                    pushState();
                }
            } catch (const std::exception& ex) {
                std::cerr << "[ws] bad message: "
                          << ex.what() << "\n";
            }
        });

    CROW_ROUTE(app, "/health")
    ([](const crow::request&, crow::response& res) {
        res.add_header("Access-Control-Allow-Origin", "*");
        res.body = "{\"status\":\"ok\"}";
        res.code = 200;
        res.end();
    });

    std::cout << "[server] listening on port 8080\n";
    app.port(8080).multithreaded().run();
    return 0;
}