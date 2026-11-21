const STEPS = [
  { key: 'posted', label: 'Posted' },
  { key: 'claimed', label: 'Claimed' },
  { key: 'picked_up', label: 'Picked up' },
  { key: 'delivered', label: 'Delivered' },
];

export default function RescueRail({ status, compact = false }) {
  const currentIndex = STEPS.findIndex((s) => s.key === status);
  const isTerminalIssue = status === 'expired' || status === 'cancelled';

  if (isTerminalIssue) {
    return (
      <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-claim bg-claim-light px-2.5 py-1 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-claim" />
        {status}
      </div>
    );
  }

  return (
    <div className={`rescue-rail w-full ${compact ? 'max-w-[220px]' : ''}`}>
      {STEPS.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={step.key} className={`node ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
            <div className="flex items-center w-full">
              {i !== 0 && <div className={`track ${i <= currentIndex ? 'done' : ''}`} />}
              <div className="dot" />
              {i !== STEPS.length - 1 && <div className={`track ${i < currentIndex ? 'done' : ''}`} />}
            </div>
            {!compact && (
              <span className={`text-[11px] font-mono uppercase tracking-wide ${active ? 'text-amber-dark font-semibold' : done ? 'text-rescue' : 'text-ink/40'}`}>
                {step.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
