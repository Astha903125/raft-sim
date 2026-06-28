import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = `ws://${window.location.hostname}:8080/ws`;
const RECONNECT_DELAY = 2000;

export function useRaftWS() {
  const ws           = useRef(null);
  const reconnTimer  = useRef(null);

  const [connected,  setConnected]  = useState(false);
  const [nodes,      setNodes]      = useState([]);
  const [rpcEvents,  setRpcEvents]  = useState([]);   // latest RPC arrows
  const [eventLog,   setEventLog]   = useState([]);   // timestamped stream
  const [error,      setError]      = useState(null);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;
    const socket = new WebSocket(WS_URL);
console.log('Connecting to:', WS_URL);

socket.onopen = () => {
    console.log('OPEN');
    setConnected(true);
    setError(null);
    socket.send(JSON.stringify({ action: 'getState' }));
};

socket.onclose = (e) => {
    console.log('CLOSE', e.code, e.reason);
    setConnected(false);
    reconnTimer.current = setTimeout(connect, RECONNECT_DELAY);
};

socket.onerror = (e) => {
    console.log('ERROR', e);
    setError('WebSocket error');
};

socket.onmessage = (e) => {
    console.log('MESSAGE', e.data);
    try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'STATE') setNodes(msg.nodes);
        if (msg.type === 'RPC') {
            const ev = { ...msg, id: Date.now() + Math.random() };
            setRpcEvents(prev => [...prev, ev]);
            setTimeout(() => setRpcEvents(prev => prev.filter(x => x.id !== ev.id)), 800);
            const ts = new Date().toLocaleTimeString('en-IN', { hour12: false });
            setEventLog(prev => [{ ts, label: msg.rpcType, type: msg.rpcType }, ...prev].slice(0, 60));
        }
        if (msg.type === 'ERROR') {
            setError(msg.msg);
            setTimeout(() => setError(null), 3000);
        }
    } catch(err) {
        console.error('Parse error:', err);
    }
};

    ws.current = socket;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  const send = useCallback((obj) => {
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify(obj));
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  const appendEntry = useCallback((cmd) => send({ action: 'append', cmd }), [send]);
  const crashNode   = useCallback((id)  => send({ action: 'crash',  id  }), [send]);
  const reviveNode  = useCallback((id)  => send({ action: 'revive', id  }), [send]);
  const forceElect  = useCallback(()    => send({ action: 'election'     }), [send]);
  const resetAll    = useCallback(()    => send({ action: 'reset'        }), [send]);

  return { connected, nodes, rpcEvents, eventLog, error,
           appendEntry, crashNode, reviveNode, forceElect, resetAll };
}

function rpcLabel(type, from, to, term) {
  const NAMES = ['A','B','C','D','E'];
  const f = from >= 0 ? 'Node '+NAMES[from] : '?';
  const t = to   >= 0 ? 'Node '+NAMES[to]   : 'all';
  switch(type) {
    case 'HB':           return `[HB] ${f} → ${t} (T${term})`;
    case 'AE':           return `[AE] ${f} → ${t} (T${term})`;
    case 'RV':           return `[RV] ${f} → ${t} requesting votes (T${term})`;
    case 'ACK':          return `[ACK] ${f} → ${t}`;
    case 'VOTE_GRANTED': return `[VOTE] ${f} → ${t} granted`;
    case 'ELECTED':      return `[ELECTED] ${f} is new leader (T${term})`;
    case 'CRASH':        return `[CRASH] ${f} went offline`;
    case 'REVIVE':       return `[REVIVE] ${f} rejoined cluster`;
    default:             return `[${type}] ${f} → ${t}`;
  }
}
