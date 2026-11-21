/** Two labeled horizontal bars comparing this period to the last — the
 * width itself carries the comparison, so it reads at a glance without
 * needing to do mental math on two raw numbers. */
export default function ComparisonBar({ label, thisValue, lastValue, unit = '', color = '#2F6F4E' }) {
  const max = Math.max(thisValue, lastValue, 1);
  const deltaPct = lastValue > 0 ? Math.round(((thisValue - lastValue) / lastValue) * 100) : null;

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-ink/70">{label}</span>
        {deltaPct !== null && (
          <span className={`font-mono text-xs font-semibold ${deltaPct >= 0 ? 'text-rescue-dark' : 'text-claim'}`}>
            {deltaPct >= 0 ? '+' : ''}{deltaPct}%
          </span>
        )}
      </div>
      <div className="h-2.5 bg-line/60 rounded-full overflow-hidden mb-3">
        <div className="h-full rounded-full transition-all" style={{ width: `${(thisValue / max) * 100}%`, background: color }} />
      </div>
    </div>
  );
}
