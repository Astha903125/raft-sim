const TYPE_COLOR = {
  HB:           'text-blue-400',
  AE:           'text-green-400',
  RV:           'text-yellow-400',
  ACK:          'text-emerald-400',
  VOTE_GRANTED: 'text-purple-400',
  ELECTED:      'text-pink-400',
  CRASH:        'text-red-400',
  REVIVE:       'text-green-300',
};

export default function EventLog({ events }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3">
      <p className="text-xs font-semibold tracking-widest text-gray-500 uppercase mb-2">RPC Event Stream</p>
      <div className="flex flex-col gap-0.5 max-h-36 overflow-y-auto font-mono">
        {events.length === 0 && (
          <span className="text-gray-600 text-xs">Waiting for events…</span>
        )}
        {events.slice(0, 30).map((ev, i) => (
          <div key={i} className="flex gap-2 text-xs border-b border-gray-800 last:border-0 py-0.5">
            <span className="text-gray-600 shrink-0">{ev.ts}</span>
            <span className={TYPE_COLOR[ev.type] || 'text-gray-400'}>{ev.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
