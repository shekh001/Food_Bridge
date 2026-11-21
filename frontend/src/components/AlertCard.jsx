import { AlertTriangle } from 'lucide-react';

const TONES = {
  amber: { bg: 'bg-amber-light', border: 'border-amber/30', icon: 'text-amber-dark' },
  claim: { bg: 'bg-claim-light', border: 'border-claim/30', icon: 'text-claim' },
  transit: { bg: 'bg-transit-light', border: 'border-transit/30', icon: 'text-transit-dark' },
};

export default function AlertCard({ title, body, tone = 'amber', icon: Icon = AlertTriangle }) {
  const t = TONES[tone] || TONES.amber;
  return (
    <div className={`rounded-xl border ${t.border} ${t.bg} p-4 flex gap-3`}>
      <Icon size={18} strokeWidth={2} className={`${t.icon} shrink-0 mt-0.5`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-ink/60 mt-0.5 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
