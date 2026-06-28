import { useState } from 'react';

const ROLE_STYLE = {
  leader:    'bg-blue-900 text-blue-200 border border-blue-600',
  follower:  'bg-gray-800 text-gray-400 border border-gray-600',
  candidate: 'bg-yellow-900 text-yellow-200 border border-yellow-600',
  crashed:   'bg-red-900 text-red-300 border border-red-600',
};

function LogEntry({ entry }) {
  return (
    <div className="flex items-center gap-2 py-1 border-b border-gray-800 last:border-0 font-mono text-xs">
      <span className="text-gray-600 w-5 text-right">#{entry.index}</span>
      <span className="text-blue-400 w-8">T{entry.term}</span>
      <span className={entry.committed ? 'text-green-400' : 'text-yellow-400'}>
        {entry.cmd}
      </span>
      <span className={`ml-auto text-xs ${entry.committed ? 'text-green-600' : 'text-yellow-600'}`}>
        {entry.committed ? '✓' : '…'}
      </span>
    </div>
  );
}

export default function NodePanel({ nodes, selectedNode, onSelect, onCrash, onRevive }) {
  const node = nodes.find(n => n.id === selectedNode);

  return (
    <div className="flex flex-col gap-3 h-full">

      {/* Node list */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-3">
        <p className="text-xs font-semibold tracking-widest text-gray-500 uppercase mb-2">Nodes</p>
        <div className="flex flex-col gap-1">
          {nodes.map(n => (
            <div
              key={n.id}
              onClick={() => onSelect(n.id)}
              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors
                ${selectedNode === n.id ? 'bg-gray-800' : 'hover:bg-gray-800'}`}
            >
              <span className="text-white font-semibold text-sm w-16">Node {['A','B','C','D','E'][n.id]}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_STYLE[n.role] || ROLE_STYLE.follower}`}>
                {n.role}
              </span>
              <span className="text-gray-500 text-xs ml-auto mr-1">L{n.logSize}</span>
              {n.alive
                ? <button
                    onClick={e => { e.stopPropagation(); onCrash(n.id); }}
                    className="text-xs px-2 py-0.5 rounded-full border border-red-800 text-red-400 hover:bg-red-900 transition-colors"
                  >crash</button>
                : <button
                    onClick={e => { e.stopPropagation(); onRevive(n.id); }}
                    className="text-xs px-2 py-0.5 rounded-full border border-green-800 text-green-400 hover:bg-green-900 transition-colors"
                  >revive</button>
              }
            </div>
          ))}
        </div>
      </div>

      {/* Log viewer */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 flex-1 overflow-hidden flex flex-col">
        <p className="text-xs font-semibold tracking-widest text-gray-500 uppercase mb-2">
          {node ? `Log — Node ${['A','B','C','D','E'][node.id]} (${node.log?.length || 0} entries)` : 'Log Viewer'}
        </p>
        {!node && (
          <p className="text-gray-600 text-xs mt-2">Click a node to inspect its log</p>
        )}
        {node && node.log?.length === 0 && (
          <p className="text-gray-600 text-xs mt-2">Log is empty</p>
        )}
        {node && node.log?.length > 0 && (
          <div className="overflow-y-auto flex-1 pr-1">
            {[...node.log].reverse().map(e => <LogEntry key={e.index} entry={e} />)}
          </div>
        )}
      </div>

    </div>
  );
}
