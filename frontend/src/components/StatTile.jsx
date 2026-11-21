import Sparkline from './Sparkline.jsx';

const ACCENTS = {
  rescue: { bg: 'bg-rescue-light', text: 'text-rescue-dark', bar: 'bg-rescue', spark: '#2F6F4E' },
  amber: { bg: 'bg-amber-light', text: 'text-amber-dark', bar: 'bg-amber', spark: '#C9840F' },
  transit: { bg: 'bg-transit-light', text: 'text-transit-dark', bar: 'bg-transit', spark: '#2C6E8E' },
  claim: { bg: 'bg-claim-light', text: 'text-claim', bar: 'bg-claim', spark: '#D64545' },
};

/**
 * One "mission control" stat card: an icon medallion, a big mono number, a
 * one-line label, an optional trend delta, and an optional sparkline. The
 * top accent bar's color is meaningful (rescue=impact, amber=urgency,
 * transit=logistics/live, claim=alert) rather than decorative — pick the
 * accent that matches what the number actually represents.
 */
export default function StatTile({ icon: Icon, label, value, suffix = '', trend, trendLabel, sparkData, accent = 'rescue' }) {
  const a = ACCENTS[accent] || ACCENTS.rescue;
  const trendUp = typeof trend === 'number' && trend >= 0;

  return (
    <div className="relative bg-white rounded-2xl border border-line shadow-tile overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${a.bar}`} />
      <div className="p-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {Icon && (
                <span className={`w-7 h-7 rounded-lg ${a.bg} ${a.text} flex items-center justify-center shrink-0`}>
                  <Icon size={15} strokeWidth={2.25} />
                </span>
              )}
              <span className="text-xs text-ink/50 truncate">{label}</span>
            </div>
            <div className="font-mono text-2xl font-semibold text-ink leading-none">
              {value}<span className="text-base text-ink/40 font-normal">{suffix}</span>
            </div>
            {typeof trend === 'number' && (
              <p className={`text-xs mt-1.5 font-medium ${trendUp ? 'text-rescue-dark' : 'text-claim'}`}>
                {trendUp ? '↑' : '↓'} {Math.abs(trend)}% <span className="text-ink/35 font-normal">{trendLabel}</span>
              </p>
            )}
          </div>
          {sparkData && <Sparkline data={sparkData} color={a.spark} />}
        </div>
      </div>
    </div>
  );
}
