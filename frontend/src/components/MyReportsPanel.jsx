import { useEffect, useState } from 'react';
import client from '../api/client.js';

const REASON_LABELS = {
  no_show: "Didn't show up / no response",
  fraud_or_fake: 'Looks fake or fraudulent',
  unsafe_or_bad_quality: 'Unsafe or bad quality food',
  unresponsive: 'Went silent mid-coordination',
  other: 'Other',
};

const ACTION_LABELS = {
  none: 'No action taken',
  warned: 'Warning issued',
  suspended: 'Account suspended',
};

/**
 * Reports you've filed against someone else, and what happened to them.
 * Without this, the only feedback a reporter ever got was a push
 * notification (easy to miss) — this is the permanent, checkable record.
 */
export default function MyReportsPanel() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/reports/mine')
      .then(({ data }) => setReports(data.reports))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || reports.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="font-display text-xl font-semibold mb-4">Reports you've filed</h2>
      <div className="space-y-3">
        {reports.map((r) => (
          <div key={r._id} className={`border rounded-2xl p-5 ${r.status === 'open' ? 'bg-claim-light border-claim/20' : 'bg-white border-line'}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-medium">
                  {r.reportedUser?.orgName || 'Deleted user'}
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-ink/[0.06] text-ink/50">
                    {r.status}
                  </span>
                </p>
                <p className="text-xs text-ink/50 mt-0.5">
                  {REASON_LABELS[r.reason]} · {r.listing?.foodType || 'listing deleted'} · {new Date(r.createdAt).toLocaleDateString()}
                </p>
                <p className="text-sm text-ink/70 mt-2">{r.description}</p>
              </div>
              <div className="text-right shrink-0">
                {r.status === 'resolved' ? (
                  <>
                    <p className="text-xs font-semibold text-ink/60">{ACTION_LABELS[r.actionTaken]}</p>
                    {r.resolutionNotes && <p className="text-xs text-ink/40 mt-1 max-w-[220px]">"{r.resolutionNotes}"</p>}
                  </>
                ) : (
                  <p className="text-xs text-ink/40">Awaiting admin review</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
