# Raft Consensus Simulator

Interactive visualizer for the Raft distributed consensus algorithm.  
**C++17 backend** (real Raft engine) · **React frontend** (canvas animation + live WebSocket)

---

## Project structure

```
raft-sim/
├── backend/
│   ├── include/
│   │   ├── raft_types.h       # LogEntry, RPC structs, RpcEvent
│   │   └── raft_node.h        # RaftNode class declaration
│   ├── src/
│   │   ├── raft_node.cpp      # Full Raft implementation
│   │   └── main.cpp           # Crow WebSocket server + cluster wiring
│   ├── CMakeLists.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── hooks/useRaftWS.js     # WebSocket connection + actions
│   │   ├── components/
│   │   │   ├── RaftCanvas.jsx     # Canvas animation (nodes + RPC arrows)
│   │   │   ├── NodePanel.jsx      # Node list + log viewer
│   │   │   ├── StatsBar.jsx       # Term / commit / leader stats
│   │   │   └── EventLog.jsx       # Live RPC event stream
│   │   └── App.jsx
│   ├── Dockerfile
│   └── nginx.conf             # Proxies /ws → backend
└── docker-compose.yml
```

---

## Run locally

### Option A — Docker Compose (recommended)

```bash
docker-compose up --build
```

- Frontend: http://localhost:3000  
- Backend WS: ws://localhost:8080/ws

### Option B — Manual

**Backend**
```bash
cd backend
sudo apt install build-essential cmake libboost-all-dev libssl-dev
cmake -B build && cmake --build build --parallel
./build/raft_sim
```

**Frontend**
```bash
cd frontend
npm install
REACT_APP_WS_URL=ws://localhost:8080/ws npm start
```

---

## Deploy to Railway / Render

1. Push repo to GitHub
2. Create two services: `backend` (Docker) and `frontend` (Docker)
3. Set env var on frontend:  
   `REACT_APP_WS_URL=wss://<your-backend-domain>/ws`
4. Done

---

## What the simulator shows

| Action | What happens |
|--------|-------------|
| **Append entry** | Leader replicates to followers via AppendEntries RPC · arrows animate · entry turns green when quorum commits |
| **Force election** | Leader steps down · RequestVote RPCs fly · new leader elected |
| **Crash a node** | Node goes offline · if leader crashes, remaining nodes hold election |
| **Revive a node** | Node rejoins · syncs log from leader |
| **Click a node** | View its full log with index, term, commit status |
| **Drag a node** | Reposition on canvas |

---

## Integrating your real C++17 backend

When you complete the actual Raft KV store:

1. Add `#include "raft_node.h"` to your existing code
2. Wire `EventCallback` to emit JSON over your WebSocket broadcast
3. The frontend needs no changes — it already consumes `{ type, rpcType, from, to, term }`

```cpp
// In your existing raft_node, wherever you send an RPC:
emit({ "AE", id_, peer->id_, currentTerm_, "" });
// → gets broadcast to frontend automatically
```
