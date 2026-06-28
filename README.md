# Raft Consensus Simulator

Interactive visualizer for the Raft distributed consensus algorithm.
**C++17 backend** (real Raft engine) · **React frontend** (canvas animation + live WebSocket)

## Live Demo
🚀 [Coming soon]

## What it shows
- 5-node Raft cluster with real leader election
- Animated RPC arrows (HB, AE, RV, ACK, VOTE)
- Click any node to inspect its log
- Crash/revive nodes and watch the cluster recover
- Append entries and watch quorum-based commit

## Run locally

### Prerequisites
- WSL2 (Ubuntu) on Windows or Linux/Mac
- `sudo apt install build-essential cmake libboost-all-dev libssl-dev git nodejs npm -y`

### Backend (C++17)
```bash
cd backend
cmake -B build
cmake --build build --parallel
./build/raft_sim
```

### Frontend (React)
```bash
cd frontend
npm install
npm run build
npx serve -s build -l 3000
```

Open **http://localhost:3000**

## Tech Stack
- **Backend:** C++17, Crow (HTTP/WebSocket), nlohmann/json, Raft consensus
- **Frontend:** React, Tailwind CSS, HTML5 Canvas, WebSocket

## Built by
Astha Kumari · RNSIT · 2026
