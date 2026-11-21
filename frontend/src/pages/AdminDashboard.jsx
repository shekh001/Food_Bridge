import { useEffect, useState } from 'react';
import client, { API_BASE_URL } from '../api/client.js';
import DashboardShell from '../components/DashboardShell.jsx';

export default function AdminDashboard() {
  const [pending, setPending] = useState([]);
  const [disputes, setDisputes] = useState({ stuck: [], cancelled: [] });
  const [reports, setReports] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [courierBookings, setCourierBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [resolvingId, setResolvingId] = useState(null);
  const [resolvingAppealId, setResolvingAppealId] = useState(null);
  const [retryingRefundId, setRetryingRefundId] = useState(null);

  async function refresh() {
    const [{ data: p }, { data: d }, { data: r }, { data: a }, { data: c }, { data: u }] = await Promise.all([
      client.get('/admin/verifications/pending'),
      client.get('/admin/disputes'),
      client.get('/admin/reports'),
      client.get('/admin/appeals'),
      client.get('/admin/couriers'),
      client.get('/admin/users'),
    ]);
    setPending(p.pending);
    setDisputes(d);
    setReports(r.reports);
    setAppeals(a.appeals);
    setCourierBookings(c.bookings);
    setUsers(u.users);
  }

  useEffect(() => { refresh(); }, []);

  async function verify(id) {
    await client.patch(`/admin/verifications/${id}/verify`);
    refresh();
  }

  async function resolveReport(id, action) {
    const labels = { none: 'dismiss this report', warned: 'warn the reported user', suspended: 'suspend the reported account' };
    if (!window.confirm(`Are you sure you want to ${labels[action]}?`)) return;
    const notes = window.prompt('Resolution notes (shown to the reported user if warned/suspended):', '') || '';
    setResolvingId(id);
    try {
      await client.patch(`/admin/reports/${id}/resolve`, { action, notes });
      refresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not resolve this report');
    } finally {
      setResolvingId(null);
    }
  }

  async function resolveAppeal(id, outcome) {
    const labels = { reinstated: 'reinstate this account', upheld: 'uphold the suspension' };
    if (!window.confirm(`Are you sure you want to ${labels[outcome]}?`)) return;
    setResolvingAppealId(id);
    try {
      await client.patch(`/admin/appeals/${id}/resolve`, { outcome });
      refresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not resolve this appeal');
    } finally {
      setResolvingAppealId(null);
    }
  }

  async function retryRefund(id) {
    setRetryingRefundId(id);
    try {
      const { data } = await client.patch(`/admin/couriers/${id}/retry-refund`);
      if (data.booking.refundStatus === 'refund_failed') {
        alert('Retry failed again — Razorpay rejected it a second time. Check the payment ID manually in the Razorpay dashboard.');
      }
      refresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not retry this refund');
    } finally {
      setRetryingRefundId(null);
    }
  }

  async function toggleSuspend(user) {
    const suspending = !user.suspended;
    const reason = suspending ? (window.prompt('Reason for suspending this account:', '') || '') : '';
    if (suspending && !window.confirm(`Suspend "${user.orgName}"? They won't be able to log in until you lift it.`)) return;
    await client.patch(`/admin/users/${user._id}/suspend`, { suspended: suspending, reason });
    refresh();
  }

  // The verification-doc route requires an Authorization header, so a plain
  // <a href> won't work (the browser navigation carries no auth token) — we
  // fetch it ourselves with the token attached, then open the resulting blob.
  const [docError, setDocError] = useState('');
  async function viewVerificationDoc(id) {
    setDocError('');
    try {
      const token = localStorage.getItem('fb_token');
      const res = await fetch(`${API_BASE_URL}/admin/verifications/${id}/document`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load document');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setDocError('Could not open the verification document.');
    }
  }

  async function promote(id, orgName) {
    if (!window.confirm(`Give "${orgName}" full admin access? This cannot be undone from here.`)) return;
    await client.patch(`/admin/users/${id}/promote`);
    refresh();
  }

  // Same "fetch with auth header, open as blob" pattern as viewVerificationDoc —
  // evidence files live behind a protected route too.
  async function viewEvidence(reportId, filename) {
    setDocError('');
    try {
      const token = localStorage.getItem('fb_token');
      const res = await fetch(`${API_BASE_URL}/reports/${reportId}/evidence/${encodeURIComponent(filename)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load evidence file');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setDocError('Could not open that evidence file.');
    }
  }

  return (
    <DashboardShell title="Platform control room" subtitle="Verifications, disputes, appeals, and courier refund issues.">

      <section className="mb-12">
        <h2 className="font-display text-xl font-semibold mb-4">Pending verifications</h2>
        <p className="text-sm text-ink/50 mb-4 -mt-2">
          Both donors and NGOs need a registration document reviewed here before they're trusted. A donor's
          document doesn't have to be a formal business licence — many genuine donors are informal setups
          (home cooks, small dhabas) who verify with a personal government ID instead; check the "Uploaded"
          tag on each row to see which one you're looking at. Donors also separately confirm their email
          (self-service) — posting access only unlocks once you approve their document with "Verify".
        </p>
        {docError && <p className="text-sm text-claim bg-claim-light px-3 py-2 rounded-lg mb-3">{docError}</p>}
        <div className="space-y-3">
          {pending.map((n) => (
            <div key={n._id} className="bg-white border border-line rounded-2xl p-5 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{n.orgName}</p>
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-ink/[0.06] text-ink/50">
                    {n.role}
                  </span>
                  {n.orgType === 'individual' && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-ink/10 text-ink/60">
                      Individual
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink/50 mt-0.5">{n.email} · {n.address}</p>
                {n.role === 'ngo' && (
                  n.darpanId ? (
                    <p className="text-xs mt-1 inline-flex items-center gap-1 text-rescue-dark bg-rescue/10 px-2 py-0.5 rounded-full">
                      NGO-Darpan: {n.darpanId}
                    </p>
                  ) : (
                    <p className="text-xs mt-1 text-ink/40">No Darpan ID provided — verify manually.</p>
                  )
                )}
                {n.role === 'donor' && (
                  <>
                    <p className="text-xs mt-1 inline-flex items-center gap-1 text-ink/60 bg-ink/[0.05] px-2 py-0.5 rounded-full">
                      {{
                        business_licence: 'Uploaded: business licence (FSSAI/GST/shop)',
                        government_id: 'Uploaded: personal govt ID (informal setup)',
                        other: 'Uploaded: other proof of identity',
                      }[n.proofType] || 'Proof type not specified'}
                    </p>
                    {n.businessRegNumber ? (
                      <p className="text-xs mt-1 inline-flex items-center gap-1 text-rescue-dark bg-rescue/10 px-2 py-0.5 rounded-full">
                        Licence/GST: {n.businessRegNumber}
                      </p>
                    ) : n.orgType !== 'individual' ? (
                      <p className="text-xs mt-1 text-ink/40">No licence/GST number provided.</p>
                    ) : null}
                    <p className="text-xs mt-1 text-ink/40">
                      {n.emailVerified ? 'Email confirmed — awaiting document review.' : "Hasn't confirmed their email yet either."}
                    </p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {n.verificationDoc ? (
                  <button onClick={() => viewVerificationDoc(n._id)}
                    className="focus-ring text-xs font-semibold px-4 py-2 rounded-full border border-line text-ink/70 hover:bg-paper">
                    View document
                  </button>
                ) : (
                  <span className="text-xs text-claim">No document uploaded</span>
                )}
                <button onClick={() => verify(n._id)}
                  className="focus-ring text-xs font-semibold px-4 py-2 rounded-full bg-rescue text-white hover:bg-rescue-dark">
                  Verify
                </button>
              </div>
            </div>
          ))}
          {pending.length === 0 && <p className="text-sm text-ink/40">No pending verifications.</p>}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="font-display text-xl font-semibold mb-4">Disputes & stuck deliveries</h2>
        <p className="text-sm text-ink/50 mb-4 -mt-2">Automatically detected — a listing stuck past its expiry, or cancelled.</p>
        <div className="space-y-3">
          {disputes.stuck.map((l) => (
            <div key={l._id} className="bg-claim-light border border-claim/20 rounded-2xl p-5">
              <p className="font-medium">{l.foodType} · {l.quantityKg} kg — past expiry, status: {l.status}</p>
              <p className="text-xs text-ink/50 mt-0.5">{l.donor?.orgName} → {l.claimedBy?.orgName || '—'}</p>
            </div>
          ))}
          {disputes.stuck.length === 0 && disputes.cancelled.length === 0 && (
            <p className="text-sm text-ink/40">No disputes right now.</p>
          )}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="font-display text-xl font-semibold mb-4">Reports</h2>
        <p className="text-sm text-ink/50 mb-4 -mt-2">
          Filed directly by donors/NGOs about each other on a specific listing — a no-show, suspected fraud,
          bad food quality, etc. Resolving with "Suspend" locks the reported account out immediately.
        </p>
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r._id} className={`border rounded-2xl p-5 ${r.status === 'open' ? 'bg-claim-light border-claim/20' : 'bg-white border-line'}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-medium">
                    {r.reporter?.orgName} reported {r.reportedUser?.orgName}
                    {r.reportedUser?.suspended && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-claim text-white">Suspended</span>
                    )}
                    {r.reportedUserTotalReports > 1 && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-light text-amber-dark">
                        {r.reportedUserTotalReports}× reported total
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink/50 mt-0.5">
                    {{
                      no_show: "Didn't show up / no response",
                      fraud_or_fake: 'Looks fake or fraudulent',
                      unsafe_or_bad_quality: 'Unsafe or bad quality food',
                      unresponsive: 'Went silent mid-coordination',
                      other: 'Other',
                    }[r.reason]} · {r.listing?.foodType || 'listing deleted'} · {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-ink/70 mt-2">{r.description}</p>
                  {r.evidence?.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {r.evidence.map((filename, i) => (
                        <button key={filename} onClick={() => viewEvidence(r._id, filename)}
                          className="focus-ring text-xs font-semibold px-3 py-1 rounded-full border border-line text-ink/60 hover:bg-paper">
                          View evidence {r.evidence.length > 1 ? i + 1 : ''}
                        </button>
                      ))}
                    </div>
                  )}
                  {r.status === 'resolved' && (
                    <p className="text-xs text-ink/40 mt-2">
                      Resolved · action: {r.actionTaken} {r.resolutionNotes && `— "${r.resolutionNotes}"`}
                    </p>
                  )}
                </div>
                {r.status === 'open' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => resolveReport(r._id, 'none')} disabled={resolvingId === r._id}
                      className="focus-ring text-xs font-semibold px-3 py-1.5 rounded-full border border-line hover:border-ink/30 disabled:opacity-60">
                      Dismiss
                    </button>
                    <button onClick={() => resolveReport(r._id, 'warned')} disabled={resolvingId === r._id}
                      className="focus-ring text-xs font-semibold px-3 py-1.5 rounded-full border border-amber text-amber-dark hover:bg-amber-light disabled:opacity-60">
                      Warn
                    </button>
                    <button onClick={() => resolveReport(r._id, 'suspended')} disabled={resolvingId === r._id}
                      className="focus-ring text-xs font-semibold px-3 py-1.5 rounded-full bg-claim text-white hover:opacity-90 disabled:opacity-60">
                      Suspend
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {reports.length === 0 && <p className="text-sm text-ink/40">No reports filed.</p>}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="font-display text-xl font-semibold mb-4">Suspension appeals</h2>
        <p className="text-sm text-ink/50 mb-4 -mt-2">
          Filed by a suspended user, by email, from the login page — they can't log in to reach anything else.
          "Reinstate" lifts the suspension immediately, same as "Lift suspension" below.
        </p>
        <div className="space-y-3">
          {appeals.map((a) => (
            <div key={a._id} className={`border rounded-2xl p-5 ${a.status === 'open' ? 'bg-claim-light border-claim/20' : 'bg-white border-line'}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-medium">
                    {a.user?.orgName || a.email}
                    {a.user?.suspended === false && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-rescue text-white">Active</span>
                    )}
                  </p>
                  <p className="text-xs text-ink/50 mt-0.5">
                    {a.email} · suspended for: {a.user?.suspendedReason || '—'} · {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-ink/70 mt-2">{a.message}</p>
                  {a.status === 'reviewed' && (
                    <p className="text-xs text-ink/40 mt-2">Resolved · outcome: {a.outcome}</p>
                  )}
                </div>
                {a.status === 'open' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => resolveAppeal(a._id, 'upheld')} disabled={resolvingAppealId === a._id}
                      className="focus-ring text-xs font-semibold px-3 py-1.5 rounded-full border border-line hover:border-ink/30 disabled:opacity-60">
                      Uphold suspension
                    </button>
                    <button onClick={() => resolveAppeal(a._id, 'reinstated')} disabled={resolvingAppealId === a._id}
                      className="focus-ring text-xs font-semibold px-3 py-1.5 rounded-full bg-rescue text-white hover:bg-rescue-dark disabled:opacity-60">
                      Reinstate account
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {appeals.length === 0 && <p className="text-sm text-ink/40">No appeals filed.</p>}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="font-display text-xl font-semibold mb-4">Courier refund issues</h2>
        <p className="text-sm text-ink/50 mb-4 -mt-2">
          Courier bookings run fine on their own — this section only ever shows the ones where an NGO's ₹35
          fee was charged (via Razorpay) but the automatic refund failed and needs a human to retry it.
        </p>
        <div className="space-y-3">
          {courierBookings.filter((b) => b.refundStatus === 'refund_failed').map((b) => (
            <div key={b._id} className="border border-claim/20 bg-claim-light rounded-2xl p-5 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-medium">
                  {b.requestedBy?.orgName} · ₹{b.feeInr} · {b.listing?.foodType || 'listing deleted'}
                </p>
                <p className="text-xs text-ink/50 mt-0.5">
                  {b.requestedBy?.email} · booked {new Date(b.createdAt).toLocaleDateString()}
                  {b.cancelledAt && ` · cancelled ${new Date(b.cancelledAt).toLocaleDateString()}`}
                </p>
                <p className="text-xs text-ink/40 mt-1 font-mono">Razorpay payment: {b.razorpayPaymentId}</p>
              </div>
              <button onClick={() => retryRefund(b._id)} disabled={retryingRefundId === b._id}
                className="focus-ring shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full bg-claim text-white hover:opacity-90 disabled:opacity-60">
                {retryingRefundId === b._id ? 'Retrying…' : 'Retry refund'}
              </button>
            </div>
          ))}
          {courierBookings.filter((b) => b.refundStatus === 'refund_failed').length === 0 && (
            <p className="text-sm text-ink/40">No failed refunds — nothing needs attention here.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold mb-4">All users</h2>
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink/[0.03] text-left text-xs uppercase tracking-wide text-ink/40">
              <tr>
                <th className="px-5 py-3 font-medium">Organization</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Verified</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="border-t border-line">
                  <td className="px-5 py-3">
                    {u.orgName}
                    {u.orgType === 'individual' && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-ink/10 text-ink/60">Individual</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs uppercase text-ink/60">{u.role}</td>
                  <td className="px-5 py-3">{u.verified ? '✓' : '—'}</td>
                  <td className="px-5 py-3">
                    {u.suspended ? (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-claim text-white">Suspended</span>
                    ) : (
                      <span className="text-xs text-ink/30">Active</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right space-x-3">
                    {u.role !== 'admin' && (
                      <>
                        <button
                          onClick={() => toggleSuspend(u)}
                          className={`focus-ring text-xs font-medium hover:underline ${u.suspended ? 'text-rescue-dark' : 'text-claim'}`}
                        >
                          {u.suspended ? 'Lift suspension' : 'Suspend'}
                        </button>
                        <button
                          onClick={() => promote(u._id, u.orgName)}
                          className="focus-ring text-xs font-medium text-claim hover:underline"
                        >
                          Make admin
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}
