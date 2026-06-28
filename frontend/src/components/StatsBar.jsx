const NAMES = ['A','B','C','D','E'];

export default function StatsBar({ nodes }) {
  const leader  = nodes.find(n => n.role === 'leader' && n.alive);
  const term    = leader?.term ?? (nodes[0]?.term ?? '—');
  //const commit = nodes.reduce((max, n) => Math.max(max, n.commit ?? -1), -1);
  //const commitCount = commit + 1; // commitIndex is 0-based
  const commitCount = Math.max(0, nodes.reduce((max, n) => Math.max(max, n.commit ?? -1), -1) + 1);
  const alive   = nodes.filter(n => n.alive).length;
  const quorum  = alive >= 3;

  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      {[
        { label: 'Term',    value: term },
        { label: 'Committed', value: Math.max(0, commitCount) },
        { label: 'Alive',   value: `${alive} / 5` },
        { label: 'Leader',  value: leader ? 'Node ' + NAMES[leader.id] : '—',
          extra: quorum ? null : <span className="text-red-400 text-xs">no quorum</span> },
      ].map(s => (
        <div key={s.label} className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-center">
          <div className="text-xl font-semibold text-white">{s.value}</div>
          <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          {s.extra && <div className="mt-0.5">{s.extra}</div>}
        </div>
      ))}
    </div>
  );
}
