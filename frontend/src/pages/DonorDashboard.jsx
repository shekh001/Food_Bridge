import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import RescueRail from '../components/RescueRail.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
import UpgradeCard from '../components/UpgradeCard.jsx';
import MyReportsPanel from '../components/MyReportsPanel.jsx';
import AuthImage from '../components/AuthImage.jsx';
import CourierStatusBadge from '../components/CourierStatusBadge.jsx';
import { ListingRowSkeleton } from '../components/Skeleton.jsx';
import StatTile from '../components/StatTile.jsx';
import RescueMark from '../components/RescueMark.jsx';
import DashboardShell from '../components/DashboardShell.jsx';
import AreaTrendChart from '../components/AreaTrendChart.jsx';
import ComparisonBar from '../components/ComparisonBar.jsx';
import AlertCard from '../components/AlertCard.jsx';
import { Package, Leaf, UtensilsCrossed, Scale, Building2, Plus, Clock } from 'lucide-react';

const FOOD_TYPES = ['Cooked meals', 'Bakery items', 'Packaged food', 'Fresh produce', 'Dairy', 'Other'];

// A lightweight trend shape for the stat tiles' sparklines — built from this
// donor's own recent listings (chronological order), not fabricated numbers.
// Falls back to a flat line if there isn't enough history yet to show a
// meaningful shape.
function sparkFromListings(listings, pick) {
  const ordered = [...listings].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(-8);
  if (ordered.length < 2) return [1, 1];
  return ordered.map(pick);
}

// Buckets this donor's listings into the last N calendar weeks by total kg
// posted — real history, not invented numbers. Week 1 = oldest.
function weeklyKgBuckets(listings, weeks = 5) {
  const now = Date.now();
  const weekMs = 7 * 24 * 3600 * 1000;
  const buckets = Array(weeks).fill(0);
  listings.forEach((l) => {
    const age = now - new Date(l.createdAt).getTime();
    const bucketFromEnd = Math.floor(age / weekMs); // 0 = this week
    const idx = weeks - 1 - bucketFromEnd;
    if (idx >= 0 && idx < weeks) buckets[idx] += l.quantityKg || 0;
  });
  return buckets;
}

// This-calendar-month vs last-calendar-month totals, for the comparison bars.
function monthComparison(listings, pick) {
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${lastMonthDate.getMonth()}`;
  let thisValue = 0;
  let lastValue = 0;
  listings.forEach((l) => {
    const d = new Date(l.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key === thisMonthKey) thisValue += pick(l);
    else if (key === lastMonthKey) lastValue += pick(l);
  });
  return { thisValue, lastValue };
}

const STATUS_ACCENT = {
  posted: 'border-l-line',
  claimed: 'border-l-transit',
  picked_up: 'border-l-amber',
  delivered: 'border-l-rescue',
  cancelled: 'border-l-claim/50',
};

export default function DonorDashboard() {
  const { user, resendVerification, updateUser } = useAuth();
  const { notifications } = useSocket();
  const [listings, setListings] = useState([]);
  const [impact, setImpact] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    foodType: FOOD_TYPES[0], description: '', quantityKg: '', hoursUntilExpiry: '4',
    address: user?.address || '',
    lat: Number.isFinite(user?.location?.lat) ? user.location.lat : null,
    lng: Number.isFinite(user?.location?.lng) ? user.location.lng : null,
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [plan, setPlan] = useState(user?.plan || 'free');
  const [csrLoading, setCsrLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [devVerifyUrl, setDevVerifyUrl] = useState('');
  const [docFile, setDocFile] = useState(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docMessage, setDocMessage] = useState('');
  const [courierByListing, setCourierByListing] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [fulfillsNeedId, setFulfillsNeedId] = useState(null);

  // Arriving from the Needs board's "I can help" button: prefill the post
  // form with what the NGO actually asked for and open it immediately,
  // rather than making the donor re-enter what they just read on the board.
  useEffect(() => {
    const needId = searchParams.get('needId');
    if (!needId) return;
    const foodType = searchParams.get('foodType');
    const qty = searchParams.get('qty');
    setFulfillsNeedId(needId);
    setForm((f) => ({
      ...f,
      foodType: FOOD_TYPES.includes(foodType) ? foodType : f.foodType,
      quantityKg: qty || f.quantityKg,
    }));
    setShowForm(true);
    setSearchParams({}, { replace: true }); // clean the URL once we've captured it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleResend() {
    setResending(true);
    setResendMessage('');
    try {
      const data = await resendVerification();
      setResendMessage(data.message);
      if (data.devVerifyUrl) setDevVerifyUrl(data.devVerifyUrl);
    } catch (err) {
      setResendMessage(err.response?.data?.message || 'Could not resend the email.');
    } finally {
      setResending(false);
    }
  }

  async function submitVerificationDoc(e) {
    e.preventDefault();
    if (!docFile) return;
    setDocUploading(true);
    setDocMessage('');
    try {
      const form = new FormData();
      form.append('verificationDoc', docFile);
      const { data } = await client.post('/auth/verification-doc', form);
      updateUser(data.user);
      setDocMessage('Document received — an admin will review it shortly.');
      setDocFile(null);
    } catch (err) {
      setDocMessage(err.response?.data?.message || 'Could not upload the document. Please try again.');
    } finally {
      setDocUploading(false);
    }
  }

  function updateLocation(lat, lng) {
    setForm((f) => ({ ...f, lat, lng }));
  }

  async function downloadCsrReport() {
    setCsrLoading(true);
    try {
      const res = await client.get('/certificates/csr-report', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `FoodBridge-CSR-Report-${user._id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      if (err.response?.status === 402) {
        setMessage('Consolidated CSR reports are a Pro feature — upgrade below to unlock.');
      } else if (err.response?.status === 404) {
        setMessage('No delivered donations yet — the consolidated report needs at least one.');
      } else {
        setMessage('Could not generate the report right now.');
      }
    } finally {
      setCsrLoading(false);
    }
  }

  async function refresh() {
    const [{ data: l }, { data: i }] = await Promise.all([
      client.get('/listings/mine'),
      client.get('/impact/mine'),
    ]);
    setListings(l.listings);
    setImpact(i);
    setLoading(false);

    // Read-only courier visibility: worth asking for on listings that are
    // either awaiting pickup or were just picked up (to show the settled
    // "picked up by X" confirmation) — not once delivered, where it's no
    // longer relevant.
    const relevantOnes = l.listings.filter((x) => ['claimed', 'picked_up'].includes(x.status));
    if (relevantOnes.length > 0) {
      const results = await Promise.all(
        relevantOnes.map((x) => client.get(`/couriers/${x._id}`).then((r) => [x._id, r.data.booking]).catch(() => [x._id, null]))
      );
      setCourierByListing(Object.fromEntries(results.filter(([, b]) => b)));
    }
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0] || null;
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : '');
  }

  useEffect(() => { refresh(); }, []);
  // NGODashboard already re-syncs on every socket notification (claim,
  // release, status change) — DonorDashboard was missing the same
  // catch-all, so a claim being released or a listing's status changing on
  // the NGO's side never reached the donor's own `listings` array until a
  // manual page reload. This keeps both dashboards symmetric.
  useEffect(() => { refresh(); }, [notifications.length]);

  useEffect(() => {
    const latest = notifications[0];
    if (latest?.kind === 'courier_assigned' && latest.payload?.listingId) {
      setCourierByListing((prev) => ({
        ...prev,
        [latest.payload.listingId]: {
          courierName: latest.payload.courierName,
          courierPhone: latest.payload.courierPhone,
          etaMinutes: latest.payload.etaMinutes,
          pickupAddress: latest.payload.pickupAddress,
          dropoffAddress: latest.payload.dropoffAddress,
          status: 'assigned',
        },
      }));
    }
    if (latest?.kind === 'courier_cancelled' && latest.payload?.listingId) {
      setCourierByListing((prev) => {
        const next = { ...prev };
        delete next[latest.payload.listingId];
        return next;
      });
    }
  }, [notifications]);

  // Stage 1: hasn't clicked the emailed link yet. Self-service, one click.
  if (user && !user.emailVerified) {
    return (
      <DashboardShell title="Confirm your email">
      <div className="max-w-xl mx-auto text-center py-12">
        <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-amber-dark bg-amber-light px-3 py-1.5 rounded-full mb-6">
          Step 1 of 2 — confirm your email
        </div>
        <h1 className="font-display text-2xl font-semibold mb-3">Confirm your email to continue</h1>
        <p className="text-ink/60 mb-8">
          We sent a verification link to <span className="font-medium text-ink">{user.email}</span>. Click it
          to confirm you control this address. After that, an admin still needs to review your registration
          document before {user.orgName} can post listings.
        </p>
        <button
          onClick={handleResend}
          disabled={resending}
          className="focus-ring px-6 py-2.5 rounded-full bg-rescue text-white font-semibold hover:bg-rescue-dark disabled:opacity-60"
        >
          {resending ? 'Sending…' : 'Resend verification email'}
        </button>
        {resendMessage && <p className="text-sm text-ink/60 mt-4">{resendMessage}</p>}
        {devVerifyUrl && (
          <p className="text-xs text-ink/40 mt-3 break-all">
            No email server configured yet — use this link directly:{' '}
            <a href={devVerifyUrl} className="text-rescue underline">{devVerifyUrl}</a>
          </p>
        )}
      </div>
      </DashboardShell>
    );
  }

  // Stage 2: email's confirmed, but an admin hasn't approved the uploaded
  // registration document yet — the actual "is this a real business" check.
  if (user && !user.verified) {
    return (
      <DashboardShell title="Registration under review">
      <div className="max-w-xl mx-auto text-center py-12">
        <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-amber-dark bg-amber-light px-3 py-1.5 rounded-full mb-6">
          Step 2 of 2 — document under review
        </div>
        <h1 className="font-display text-2xl font-semibold mb-3">Your registration is being reviewed</h1>
        <p className="text-ink/60 mb-8">
          Email confirmed ✓ — an admin still needs to check {user.orgName}'s registration document before
          you can post listings. This is usually quick.
        </p>

        {user.verificationDoc ? (
          <p className="text-sm text-rescue-dark bg-rescue/10 px-4 py-3 rounded-xl mb-6">
            We have your document on file — you can upload a replacement below if needed.
          </p>
        ) : (
          <p className="text-sm text-claim bg-claim-light px-4 py-3 rounded-xl mb-6 text-left">
            We don't have a document on file for your account, so an admin can't approve it yet. Please
            upload one below.
          </p>
        )}

        <form onSubmit={submitVerificationDoc} className="text-left space-y-3">
          <label className="block text-sm font-medium">
            {user.verificationDoc ? 'Upload a replacement document' : 'Registration / verification document'}
          </label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
            onChange={(e) => setDocFile(e.target.files?.[0] || null)}
            className="focus-ring w-full text-sm px-4 py-2.5 rounded-xl border border-line bg-white file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-rescue/10 file:text-rescue-dark"
          />
          {docMessage && (
            <p className="text-sm px-3 py-2 rounded-lg bg-paper text-ink/70">{docMessage}</p>
          )}
          <button
            type="submit"
            disabled={!docFile || docUploading}
            className="focus-ring w-full py-3 rounded-full bg-rescue text-white font-semibold hover:bg-rescue-dark transition-colors disabled:opacity-60"
          >
            {docUploading ? 'Uploading…' : 'Submit document'}
          </button>
        </form>
      </div>
      </DashboardShell>
    );
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!Number.isFinite(form.lat) || !Number.isFinite(form.lng)) {
      setMessage('Please set a pickup location on the map.');
      return;
    }
    setSubmitting(true);
    setMessage('');
    try {
      const expiryAt = new Date(Date.now() + parseFloat(form.hoursUntilExpiry) * 3600 * 1000);
      const pickupLocation = { address: form.address, lat: parseFloat(form.lat), lng: parseFloat(form.lng) };

      // Only switch to multipart/form-data when there's actually a photo to
      // carry — plain JSON is simpler and keeps every other listing-creation
      // path (including existing tests) untouched.
      if (photoFile) {
        const fd = new FormData();
        fd.append('foodType', form.foodType);
        fd.append('description', form.description);
        fd.append('quantityKg', parseFloat(form.quantityKg));
        fd.append('expiryAt', expiryAt.toISOString());
        fd.append('pickupLocation', JSON.stringify(pickupLocation));
        fd.append('photo', photoFile);
        if (fulfillsNeedId) fd.append('fulfillsNeedId', fulfillsNeedId);
        await client.post('/listings', fd);
      } else {
        await client.post('/listings', {
          foodType: form.foodType,
          description: form.description,
          quantityKg: parseFloat(form.quantityKg),
          expiryAt,
          pickupLocation,
          fulfillsNeedId: fulfillsNeedId || undefined,
        });
      }
      setMessage(
        fulfillsNeedId
          ? 'Listing posted — the NGO who needed this has been notified directly.'
          : 'Listing posted — matched NGOs have been notified.'
      );
      setShowForm(false);
      setFulfillsNeedId(null);
      setForm((f) => ({ ...f, description: '', quantityKg: '' }));
      setPhotoFile(null);
      setPhotoPreview('');
      refresh();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not create listing.');
    } finally {
      setSubmitting(false);
    }
  }

  async function markStatus(id, status) {
    await client.patch(`/listings/${id}/status`, { status });
    refresh();
  }

  async function cancelListing(l) {
    const alreadyClaimed = l.status === 'claimed';
    const confirmMsg = alreadyClaimed
      ? `${l.claimedBy?.orgName || 'The NGO that claimed this'} will be notified that this donation is cancelled. Continue?`
      : 'Cancel this listing? It will be removed from every NGO\'s feed.';
    if (!window.confirm(confirmMsg)) return;

    const reason = window.prompt('Optional: reason for cancelling (shown to the NGO if already claimed)', '') || '';
    setCancellingId(l._id);
    try {
      await client.patch(`/listings/${l._id}/status`, { status: 'cancelled', notes: reason || undefined });
      setMessage('Listing cancelled.');
      refresh();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not cancel this listing.');
    } finally {
      setCancellingId(null);
    }
  }

  async function downloadCertificate(id) {
    const res = await client.get(`/certificates/${id}`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `FoodBridge-Certificate-${id}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  const expiringSoon = listings.filter(
    (l) => l.status === 'posted' && new Date(l.expiryAt).getTime() - Date.now() < 3 * 3600 * 1000 && new Date(l.expiryAt).getTime() > Date.now()
  );
  const kgComparison = monthComparison(listings, (l) => l.quantityKg);
  const countComparison = monthComparison(listings, () => 1);
  const [searchTerm, setSearchTerm] = useState('');
  const visibleListings = listings.filter((l) =>
    !searchTerm.trim() || l.foodType.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  return (
    <DashboardShell
      title={user?.orgName}
      subtitle="Track your surplus, donations, and impact."
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder="Search your listings…"
      action={
        <button onClick={() => setShowForm((s) => !s)}
          className="focus-ring inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-rescue text-white text-sm font-semibold hover:bg-rescue-dark transition-colors">
          <Plus size={15} strokeWidth={2.5} />
          {showForm ? 'Cancel' : 'Post surplus food'}
        </button>
      }
    >
      {impact && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatTile icon={Package} label="Donations delivered" value={impact.donationsCompleted}
            accent="rescue" sparkData={sparkFromListings(listings, () => 1)} />
          <StatTile icon={Leaf} label="Food diverted" value={impact.kgDiverted} suffix=" kg"
            accent="transit" sparkData={sparkFromListings(listings, (l) => l.quantityKg)} />
          <StatTile icon={UtensilsCrossed} label="Meals provided" value={impact.mealsSaved}
            accent="amber" sparkData={sparkFromListings(listings, (l) => Math.round(l.quantityKg * 2.5))} />
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-4 mb-6">
        <div className="bg-white border border-line rounded-2xl p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-lg font-semibold">Surplus trend</h2>
          </div>
          <p className="text-xs text-ink/40 mb-2">Kg posted per week, last 5 weeks</p>
          <AreaTrendChart
            data={weeklyKgBuckets(listings)}
            labels={['5w ago', '4w ago', '3w ago', '2w ago', 'This week']}
            color="#2C6E8E"
          />
        </div>
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-line rounded-2xl p-5">
            <h3 className="font-display text-base font-semibold mb-4">This month vs last</h3>
            <ComparisonBar label="Listings posted" thisValue={countComparison.thisValue} lastValue={countComparison.lastValue} color="#2F6F4E" />
            <ComparisonBar label="Kg diverted" thisValue={kgComparison.thisValue} lastValue={kgComparison.lastValue} color="#2C6E8E" />
          </div>
          {expiringSoon.length > 0 && (
            <AlertCard
              tone="claim"
              icon={Clock}
              title={`${expiringSoon.length} listing${expiringSoon.length > 1 ? 's' : ''} expiring soon`}
              body={`${expiringSoon.map((l) => l.foodType).join(', ')} — still unclaimed with under 3 hours left.`}
            />
          )}
        </div>
      </div>

      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div className="flex-1 min-w-[280px]">
          <UpgradeCard onUpgraded={(u) => setPlan(u.plan)} />
        </div>
        <button onClick={downloadCsrReport} disabled={csrLoading}
          title={plan !== 'pro' ? 'Pro feature — upgrade to unlock' : 'Download consolidated CSR report'}
          className={`focus-ring text-sm font-semibold px-4 py-2.5 rounded-full border whitespace-nowrap disabled:opacity-60 ${
            plan === 'pro' ? 'bg-amber text-ink border-amber hover:bg-amber-dark' : 'border-line text-ink/40'
          }`}>
          {csrLoading ? 'Generating…' : plan === 'pro' ? '📄 Download consolidated CSR report' : '🔒 Consolidated CSR report (Pro)'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-line rounded-2xl p-6 mb-10 space-y-4">
          {fulfillsNeedId && (
            <div className="bg-transit-light text-transit-dark text-sm px-4 py-2.5 rounded-xl flex items-center justify-between gap-3">
              <span>Responding to a need from the board — this listing will be sent to that NGO directly.</span>
              <button type="button" onClick={() => setFulfillsNeedId(null)} className="focus-ring text-xs font-semibold underline shrink-0">
                Post normally instead
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Food type</label>
              <select value={form.foodType} onChange={(e) => setForm({ ...form, foodType: e.target.value })}
                className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line">
                {FOOD_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Quantity (kg)</label>
              {user?.orgType === 'individual' && (
                <div className="flex gap-1.5 mb-1.5">
                  {[2, 5].map((kg) => (
                    <button key={kg} type="button" onClick={() => setForm({ ...form, quantityKg: String(kg) })}
                      className={`focus-ring px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                        form.quantityKg === String(kg) ? 'bg-rescue text-white border-rescue' : 'border-line text-ink/60 hover:border-ink/30'
                      }`}>
                      {kg} kg
                    </button>
                  ))}
                </div>
              )}
              <input type="number" step="0.1" required value={form.quantityKg}
                onChange={(e) => setForm({ ...form, quantityKg: e.target.value })}
                placeholder={user?.orgType === 'individual' ? 'Or type an exact amount' : undefined}
                className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line" rows={2} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Pickup window (hours)</label>
            <input type="number" min="0.5" step="0.5" required value={form.hoursUntilExpiry}
              onChange={(e) => setForm({ ...form, hoursUntilExpiry: e.target.value })}
              className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Pickup address</label>
            <input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Pickup location</label>
            <LocationPicker lat={form.lat} lng={form.lng} onChange={updateLocation} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Photo of the food <span className="text-ink/40 font-normal">(optional, but listings with a photo get claimed faster)</span>
            </label>
            <div className="flex items-center gap-4">
              {photoPreview && (
                <img src={photoPreview} alt="Preview" className="w-16 h-16 rounded-xl object-cover border border-line shrink-0" />
              )}
              <input type="file" accept=".jpg,.jpeg,.png,.webp,image/*" onChange={handlePhotoChange}
                className="focus-ring flex-1 text-xs text-ink/60 file:mr-3 file:px-3 file:py-1.5 file:rounded-full file:border-0 file:bg-ink/[0.06] file:text-xs file:font-medium file:cursor-pointer" />
            </div>
          </div>
          <button type="submit" disabled={submitting}
            className="focus-ring px-6 py-2.5 rounded-full bg-rescue text-white font-semibold hover:bg-rescue-dark transition-colors disabled:opacity-60">
            {submitting ? 'Posting…' : 'Post listing'}
          </button>
        </form>
      )}

      {message && <p className="text-sm text-rescue bg-rescue-light px-4 py-2.5 rounded-xl mb-8">{message}</p>}

      <h2 className="font-display text-xl font-semibold mb-4">Your listings</h2>
      <div className="space-y-3">
        {loading && <ListingRowSkeleton count={3} />}
        {!loading && visibleListings.map((l) => (
          <div key={l._id} className={`bg-white border border-line border-l-[3px] ${STATUS_ACCENT[l.status] || 'border-l-line'} rounded-2xl p-5 flex flex-col gap-1`}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4 min-w-[220px]">
                {l.photo ? (
                  <AuthImage src={`/listings/${l._id}/photo/${encodeURIComponent(l.photo)}`} alt={l.foodType}
                    className="w-12 h-12 rounded-xl object-cover border border-line shrink-0"
                    fallback={<div className="w-12 h-12 rounded-xl bg-paper border border-line shrink-0 flex items-center justify-center text-lg">🍲</div>} />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-paper border border-line shrink-0 flex items-center justify-center text-lg">🍲</div>
                )}
                <div>
                  <p className="font-medium">{l.foodType}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-ink/50">
                    <span className="inline-flex items-center gap-1"><Scale size={12} />{l.quantityKg} kg</span>
                    {l.claimedBy ? (
                      <span className="inline-flex items-center gap-1"><Building2 size={12} />{l.claimedBy.orgName}</span>
                    ) : (
                      <span className="text-ink/35">Not yet claimed</span>
                    )}
                  </div>
                </div>
              </div>
              <RescueRail status={l.status} compact />
              <div className="flex gap-2">
                {['posted', 'claimed'].includes(l.status) && (
                  <button onClick={() => cancelListing(l)} disabled={cancellingId === l._id}
                    className="focus-ring text-xs font-semibold px-3 py-1.5 rounded-full border border-claim/40 text-claim hover:bg-claim-light disabled:opacity-60">
                    {cancellingId === l._id ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}
                {l.status === 'claimed' && (
                  <button onClick={() => markStatus(l._id, 'picked_up')}
                    className="focus-ring text-xs font-semibold px-3 py-1.5 rounded-full border border-line hover:border-ink/30">
                    Mark picked up
                  </button>
                )}
                {l.status === 'picked_up' && (
                  <button onClick={() => markStatus(l._id, 'delivered')}
                    className="focus-ring text-xs font-semibold px-3 py-1.5 rounded-full bg-rescue text-white hover:bg-rescue-dark">
                    Confirm delivered
                  </button>
                )}
                {l.status === 'delivered' && (
                  <button onClick={() => downloadCertificate(l._id)}
                    className="focus-ring text-xs font-semibold px-3 py-1.5 rounded-full bg-amber text-ink hover:bg-amber-dark">
                    Download certificate
                  </button>
                )}
              </div>
            </div>
            {['claimed', 'picked_up'].includes(l.status) && courierByListing[l._id] && (
              <CourierStatusBadge booking={courierByListing[l._id]} />
            )}
          </div>
        ))}
        {listings.length === 0 && (
          <div className="border border-dashed border-line rounded-2xl p-10 text-center">
            <RescueMark size={64} className="mx-auto mb-4" />
            <p className="text-ink/50">No listings yet — post your first surplus food batch above.</p>
          </div>
        )}
        {listings.length > 0 && visibleListings.length === 0 && (
          <div className="border border-dashed border-line rounded-2xl p-10 text-center text-ink/50">
            No listings match "{searchTerm}".
          </div>
        )}
      </div>

      <MyReportsPanel />
    </DashboardShell>
  );
}
