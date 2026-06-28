import { useState } from 'react';
import RaftCanvas from './components/RaftCanvas';
import NodePanel  from './components/NodePanel';
import StatsBar   from './components/StatsBar';
import EventLog   from './components/EventLog';
import { useRaftWS } from './hooks/useRaftWS';

export default function App() {
  const [selectedNode, setSelectedNode] = useState(null);
  const [cmdInput, setCmdInput]         = useState('');

  const {
    connected, nodes, rpcEvents, eventLog, error,
    appendEntry, crashNode, reviveNode, forceElect, resetAll,
  } = useRaftWS();
  console.log("APP NODES:", nodes);
console.log("APP LENGTH:", nodes.length);
  const handleAppend = () => {
    const cmd = cmdInput.trim() || `set key${Date.now() % 1000}=${Math.floor(Math.random()*999)}`;
    appendEntry(cmd);
    setCmdInput('');
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6 font-sans">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Raft Consensus <span className="text-blue-400">Simulator</span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Distributed KV Store · 5-node cluster · C++17 backend
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'} animate-pulse`}/>
          <span className="text-xs text-gray-400">{connected ? 'Connected' : 'Reconnecting…'}</span>
        </div>
      </div>

      {/* ── Error toast ── */}
      {error && (
        <div className="mb-4 bg-red-950 border border-red-700 text-red-300 text-sm px-4 py-2 rounded-lg">
          ⚠ {error}
        </div>
      )}

      {/* ── Stats ── */}
      <StatsBar nodes={nodes} />

      {/* ── Controls ── */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex gap-1 flex-1 min-w-0">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 min-w-0"
            placeholder="Command (e.g. set user=Astha)"
            value={cmdInput}
            onChange={e => setCmdInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAppend()}
          />
          <button
            onClick={handleAppend}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
          >+ Append</button>
        </div>
        <button
          onClick={forceElect}
          className="bg-yellow-700 hover:bg-yellow-600 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors"
        >Force Election</button>
        <button
          onClick={resetAll}
          className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors"
        >Reset</button>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Canvas */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <RaftCanvas
            nodes={nodes}
            rpcEvents={rpcEvents}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
          />
          <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-500">
            Click node to inspect log · Drag to reposition
          </div>
        </div>

        {/* Node panel */}
        <div className="lg:col-span-1">
          <NodePanel
            nodes={nodes}
            selectedNode={selectedNode}
            onSelect={setSelectedNode}
            onCrash={crashNode}
            onRevive={reviveNode}
          />
        </div>
      </div>

      {/* ── Event stream ── */}
      <div className="mt-4">
        <EventLog events={eventLog} />
      </div>

      {/* ── Footer ── */}
      <p className="text-center text-xs text-gray-700 mt-5">
        Built by Astha Kumari · Raft consensus (Ongaro & Ousterhout, 2014) · C++17 + React
      </p>

    </div>
  );
}
