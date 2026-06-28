import { useEffect, useRef, useCallback } from 'react';

const W = 680, H = 360;
const R = 32;
const NAMES  = ['A','B','C','D','E'];
const COLORS = {
  leader:    { fill:'#1e3a5f', stroke:'#3B82F6', text:'#93C5FD', ring:'#3B82F6' },
  follower:  { fill:'#1a1a2e', stroke:'#4B5563', text:'#9CA3AF', ring:'#4B5563' },
  candidate: { fill:'#3d2a00', stroke:'#D97706', text:'#FCD34D', ring:'#F59E0B' },
  crashed:   { fill:'#2d1515', stroke:'#DC2626', text:'#FCA5A5', ring:'#EF4444' },
};
const RPC_COLORS = {
  HB:           '#3B82F6',
  AE:           '#10B981',
  RV:           '#F59E0B',
  ACK:          '#6EE7B7',
  VOTE_GRANTED: '#A78BFA',
  ELECTED:      '#F472B6',
  CRASH:        '#EF4444',
  REVIVE:       '#10B981',
};

function nodePos(i, cx, cy, radius) {
  const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

export default function RaftCanvas({ nodes, rpcEvents, selectedNode, onSelectNode }) {
  const canvasRef   = useRef(null);
  const stateRef    = useRef({ nodes: [], rpcEvents: [], selectedNode: null, arrows: [], pulses: [] });
  const rafRef      = useRef(null);
  const lastTsRef   = useRef(0);
  const dragRef     = useRef(null);
  const posOverride = useRef({});  // { nodeId: {x,y} } for dragging

  // sync latest props into ref (no re-render needed for animation)
  useEffect(() => { 
    stateRef.current.nodes = nodes;
    console.log('Canvas nodes updated:', nodes.length);
}, [nodes]);
  useEffect(() => { stateRef.current.selectedNode = selectedNode; }, [selectedNode]);

  // spawn arrows when new rpcEvents arrive
  useEffect(() => {
    const latest = rpcEvents[rpcEvents.length - 1];
    if (!latest) return;
    const s = stateRef.current;
    const cx = W/2, cy = H/2 - 10, radius = 120;
    const from = latest.from >= 0 ? nodePos(latest.from, cx, cy, radius) : null;
    const to   = latest.to   >= 0 ? nodePos(latest.to,   cx, cy, radius) : null;
    if (!from || !to) return;

    s.arrows.push({
      id:    latest.id,
      fx: posOverride.current[latest.from]?.x ?? from.x,
      fy: posOverride.current[latest.from]?.y ?? from.y,
      tx: posOverride.current[latest.to]?.x   ?? to.x,
      ty: posOverride.current[latest.to]?.y   ?? to.y,
      t:  0,
      color: RPC_COLORS[latest.rpcType] || '#888',
      label: latest.rpcType,
    });

    // pulse on ELECTED / REVIVE / CRASH
    if (['ELECTED','REVIVE','CRASH'].includes(latest.rpcType) && from) {
      s.pulses.push({ x: from.x, y: from.y, r: R, maxR: R+50, t: 0, color: RPC_COLORS[latest.rpcType] });
    }
  }, [rpcEvents]);

  const getPos = useCallback((id) => {
    const cx = W/2, cy = H/2 - 10, radius = 120;
    return posOverride.current[id] ?? nodePos(id, cx, cy, radius);
  }, []);

  // ── Draw loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function draw(ts) {
      const dt = ts - lastTsRef.current; lastTsRef.current = ts;
      const { nodes, selectedNode, arrows, pulses } = stateRef.current;
      ctx.clearRect(0, 0, W, H);

      // background
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(0, 0, W, H);

      // grid dots
      ctx.fillStyle = '#1a1a2e';
      for (let x = 20; x < W; x += 30)
        for (let y = 20; y < H; y += 30) {
          ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI*2); ctx.fill();
        }

      // edges between nodes
      if (nodes.length) {
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i+1; j < nodes.length; j++) {
            const a = getPos(i), b = getPos(j);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            const alive = nodes[i]?.alive && nodes[j]?.alive;
            ctx.strokeStyle = alive ? '#2a2a4a' : '#1a1a2a';
            ctx.lineWidth = 0.5;
            ctx.setLineDash(alive ? [] : [4,5]);
            ctx.stroke(); ctx.setLineDash([]);
          }
        }
      }

      // pulses
      stateRef.current.pulses = pulses.filter(p => p.t < 1);
      pulses.forEach(p => {
        p.t += dt / 900;
        const cr = p.r + (p.maxR - p.r) * p.t;
        ctx.beginPath(); ctx.arc(p.x, p.y, cr, 0, Math.PI*2);
        ctx.strokeStyle = p.color; ctx.lineWidth = 1.5;
        ctx.globalAlpha = (1 - p.t) * 0.6; ctx.stroke(); ctx.globalAlpha = 1;
      });

      // animated RPC arrows
      stateRef.current.arrows = arrows.filter(a => a.t < 1);
      arrows.forEach(a => {
        a.t += dt / 650;
        const t = Math.min(a.t, 1);
        const ease = t < .5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;

        const dx = a.tx - a.fx, dy = a.ty - a.fy;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx/len, uy = dy/len;
        const nx = -uy, ny = ux;
        const curve = 22;
        const mx = (a.fx+a.tx)/2 + nx*curve, my = (a.fy+a.ty)/2 + ny*curve;

        // curved path
        ctx.beginPath();
        ctx.moveTo(a.fx + ux*R, a.fy + uy*R);
        ctx.quadraticCurveTo(mx, my, a.tx - ux*R, a.ty - uy*R);
        ctx.strokeStyle = a.color; ctx.lineWidth = 0.8;
        ctx.globalAlpha = (1-t) * 0.7; ctx.stroke(); ctx.globalAlpha = 1;

        // moving dot
        const bx = a.fx + (a.tx-a.fx)*ease + nx*(curve * Math.sin(t*Math.PI));
        const by = a.fy + (a.ty-a.fy)*ease + ny*(curve * Math.sin(t*Math.PI));

        // glow
        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, 10);
        grad.addColorStop(0, a.color);
        grad.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(bx, by, 10, 0, Math.PI*2);
        ctx.fillStyle = grad; ctx.globalAlpha = 0.4; ctx.fill(); ctx.globalAlpha = 1;

        // dot
        ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI*2);
        ctx.fillStyle = a.color; ctx.fill();

        // arrowhead at destination
        if (t > 0.85) {
          const ax2 = a.tx - ux*R, ay2 = a.ty - uy*R;
          ctx.beginPath();
          ctx.moveTo(ax2, ay2);
          ctx.lineTo(ax2 - ux*10 + nx*5, ay2 - uy*10 + ny*5);
          ctx.lineTo(ax2 - ux*10 - nx*5, ay2 - uy*10 - ny*5);
          ctx.closePath();
          ctx.fillStyle = a.color; ctx.globalAlpha = 1-t; ctx.fill(); ctx.globalAlpha = 1;
        }

        // label mid-flight
        if (t > 0.25 && t < 0.75) {
          const lx = (a.fx+a.tx)/2 + nx*(curve+12);
          const ly = (a.fy+a.ty)/2 + ny*(curve+12);
          ctx.font = '500 10px monospace';
          ctx.fillStyle = a.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.globalAlpha = Math.sin(t * Math.PI);
          ctx.fillText(a.label, lx, ly);
          ctx.globalAlpha = 1;
        }
      });

      // nodes
      nodes.forEach((n) => {
        const pos = getPos(n.id);
        const th  = COLORS[n.role] || COLORS.follower;
        const isSel = selectedNode === n.id;

        // selection ring
        if (isSel) {
          ctx.beginPath(); ctx.arc(pos.x, pos.y, R+10, 0, Math.PI*2);
          ctx.strokeStyle = '#818CF8'; ctx.lineWidth = 1.5;
          ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]);
        }

        // leader orbit ring
        if (th.ring && n.role === 'leader') {
          ctx.beginPath(); ctx.arc(pos.x, pos.y, R+5, 0, Math.PI*2);
          ctx.strokeStyle = th.ring; ctx.lineWidth = 1;
          ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);
        }

        // glow under node
        const glow = ctx.createRadialGradient(pos.x, pos.y, R*0.5, pos.x, pos.y, R*2.2);
        glow.addColorStop(0, (th.ring || '#444') + '33');
        glow.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(pos.x, pos.y, R*2.2, 0, Math.PI*2);
        ctx.fillStyle = glow; ctx.fill();

        // node circle
        ctx.beginPath(); ctx.arc(pos.x, pos.y, R, 0, Math.PI*2);
        ctx.fillStyle = th.fill; ctx.fill();
        ctx.strokeStyle = th.stroke; ctx.lineWidth = 1.5; ctx.stroke();

        // node label
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = th.text;
        ctx.fillText(NAMES[n.id], pos.x, pos.y - 6);

        ctx.font = '500 10px sans-serif';
        ctx.fillStyle = th.text;
        ctx.fillText(n.role, pos.x, pos.y + 7);

        ctx.font = '400 9px monospace';
        ctx.fillStyle = th.text + 'aa';
        ctx.fillText(`T${n.term} · L${n.logSize}`, pos.x, pos.y + 19);
      });

      // legend
      const legend = [['#3B82F6','HB'],['#10B981','AE'],['#F59E0B','RV'],['#6EE7B7','ACK'],['#A78BFA','VOTE']];
      legend.forEach(([c,l], i) => {
        const lx = 10 + i*132, ly = H - 14;
        ctx.beginPath(); ctx.arc(lx+4, ly, 4, 0, Math.PI*2);
        ctx.fillStyle = c; ctx.fill();
        ctx.font = '400 10px sans-serif'; ctx.fillStyle = '#666688';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(l, lx+11, ly);
      });
      ctx.textAlign = 'center';

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [getPos]);

  // ── Mouse events (click to select, drag to reposition) ────────────────────
  const getNodeAt = useCallback((mx, my) => {
    const cx = W/2, cy = H/2-10, radius = 120;
    for (let i = 0; i < 5; i++) {
      const p = posOverride.current[i] ?? nodePos(i, cx, cy, radius);
      if (Math.hypot(mx - p.x, my - p.y) < R + 6) return i;
    }
    return -1;
  }, []);

  const toCanvas = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      mx: (e.clientX - rect.left) * (W / rect.width),
      my: (e.clientY - rect.top)  * (H / rect.height),
    };
  }, []);

  const onMouseDown = useCallback((e) => {
    const { mx, my } = toCanvas(e);
    const id = getNodeAt(mx, my);
    if (id >= 0) dragRef.current = { id, startX: mx, startY: my, moved: false };
  }, [getNodeAt, toCanvas]);

  const onMouseMove = useCallback((e) => {
    if (!dragRef.current) return;
    const { mx, my } = toCanvas(e);
    const dx = mx - dragRef.current.startX;
    const dy = my - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 4) dragRef.current.moved = true;
    const cx = W/2, cy = H/2-10, radius = 120;
    const base = nodePos(dragRef.current.id, cx, cy, radius);
    posOverride.current[dragRef.current.id] = {
      x: (base.x + posOverride.current[dragRef.current.id]?.x ?? base.x) / 2 + dx/2,
      y: (base.y + posOverride.current[dragRef.current.id]?.y ?? base.y) / 2 + dy/2,
    };
    // simpler: just set directly
    posOverride.current[dragRef.current.id] = { x: mx, y: my };
  }, [toCanvas]);

  const onMouseUp = useCallback((e) => {
    if (!dragRef.current) return;
    if (!dragRef.current.moved) {
      onSelectNode(dragRef.current.id);
    }
    dragRef.current = null;
  }, [onSelectNode]);

  return (
    <canvas
      ref={canvasRef}
      width={W} height={H}
      style={{ width:'100%', cursor:'pointer', borderRadius:'12px 12px 0 0' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    />
  );
}
