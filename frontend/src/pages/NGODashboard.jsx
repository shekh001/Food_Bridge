import { useEffect, useState } from 'react';
import client from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import ListingCard from '../components/ListingCard.jsx';
import RescueRail from '../components/RescueRail.jsx';
import RoutePlanner from '../components/RoutePlanner.jsx';
import DemandHotspots from '../components/DemandHotspots.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import MyReportsPanel from '../components/MyReportsPanel.jsx';
import { ListingCardSkeleton, ListingRowSkeleton } from '../components/Skeleton.jsx';
import CourierBookingCard from '../components/CourierBookingCard.jsx';
import CourierStatusBadge from '../components/CourierStatusBadge.jsx';
import StatTile from '../components/StatTile.jsx';
import { Truck, Leaf, UtensilsCrossed, Scale, Store, Clock } from 'lucide-react';
import RescueMark from '../components/RescueMark.jsx';
import DashboardShell from '../components/DashboardShell.jsx';
import AreaTrendChart from '../components/AreaTrendChart.jsx';
import ComparisonBar from '../components/ComparisonBar.jsx';
import AlertCard from '../components/AlertCard.jsx';
import NGONeedsPanel from '../components/NGONeedsPanel.jsx';

// A lightweight trend shape for the stat tiles' sparklines — built from this
// NGO's own recent claims (chronological), not fabricated numbers. Falls
// back to a flat line if there isn't enough history yet.
function sparkFromClaims(claims, pick) {
  const ordered = [...claims].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(-8);
  if (ordered.length < 2) return [1, 1];
  return ordered.map(pick);
}

// Buckets this NGO's claims into the last N calendar weeks by total kg
// received — real history, not invented numbers. Week 1 = oldest.
function weeklyKgBuckets(claims, weeks = 5) {
  const now = Date.now();
  const weekMs = 7 * 24 * 3600 * 1000;
  const buckets = Array(weeks).fill(0);
  claims.forEach((l) => {
    const age = now - new Date(l.createdAt).getTime();
    const bucketFromEnd = Math.floor(age / weekMs);
    const idx = weeks - 1 - bucketFromEnd;
    if (idx >= 0 && idx < weeks) buckets[idx] += l.quantityKg || 0;
  });
  return buckets;
}

function monthComparison(items, pick) {
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${lastMonthDate.getMonth()}`;
  let thisValue = 0;
  let lastValue = 0;
  items.forEach((l) => {
    const d = new Date(l.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key === thisMonthKey) thisValue += pick(l);
    else if (key === lastMonthKey) lastValue += pick(l);
  });
  return { thisValue, lastValue };
}

const STATUS_ACCENT = {
  claimed: 'border-l-transit',
  picked_up: 'border-l-amber',
  delivered: 'border-l-rescue',
};

export default function NGODashboard() {
  const { user, updateUser } = useAuth();
  const { notifications } = useSocket();
  const [available, setAvailable] = useState([]);
  const [claimed, setClaimed] = useState([]);
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [docFile, setDocFile] = useState(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docMessage, setDocMessage] = useState('');
  const [capacityInput, setCapacityInput] = useState(user?.dailyCapacityKg ?? '');
  const [capacitySaving, setCapacitySaving] = useState(false);
  const [capacityMessage, setCapacityMessage] = useState('');
  // listingId -> booking, for claimed pickups this NGO has requested a courier for
  const [courierByListing, setCourierByListing] = useState({});

  async function refresh() {
    const [{ data: avail }, { data: mine }, { data: imp }, { data: couriers }] = await Promise.all([
      client.get('/listings', { params: { status: 'posted' } }),
      client.get('/listings/my-claims'),
      client.get('/impact/mine'),
      client.get('/couriers/mine'),
    ]);
    setAvailable(avail.listings);
    setClaimed(mine.listings);
    setImpact(imp);
    const byListing = {};
    couriers.bookings
      .filter((b) => b.status !== 'cancelled')
      .forEach((b) => { byListing[b.listing._id] = b; });
    setCourierByListing(byListing);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => { refresh(); }, [notifications.length]);

  // Instant feedback the moment ANY listing gets claimed by someone —
  // don't wait for the network refresh() above to finish; just drop it from
  // the visible list right now so an NGO never taps "Claim" on something
  // that's already gone.
  useEffect(() => {
    const latest = notifications[0];
    if (latest?.kind === 'removed' && latest.payload?.listingId) {
      setAvailable((prev) => prev.filter((l) => l._id !== latest.payload.listingId));
    }
    if (latest?.kind === 'courier_assigned' && latest.payload?.listingId) {
      setCourierByListing((prev) => ({
        ...prev,
        [latest.payload.listingId]: {
          _id: latest.payload.bookingId,
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

  async function cancelCourier(listingId, bookingId) {
    if (!window.confirm('Cancel this courier booking?')) return;
    try {
      const { data } = await client.patch(`/couriers/${bookingId}/cancel`);
      setCourierByListing((prev) => {
        const next = { ...prev };
        delete next[listingId];
        return next;
      });
      if (data.refundMessage) window.alert(data.refundMessage);
    } catch (err) {
      window.alert(err.response?.data?.message || 'Could not cancel the courier booking.');
    }
  }

  async function claim(id) {
    try {
      await client.post(`/listings/${id}/claim`);
      refresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not claim this listing');
    }
  }

  async function markStatus(id, status) {
    try {
      await client.patch(`/listings/${id}/status`, { status });
      refresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not update this listing');
    }
  }

  async function release(id) {
    if (!window.confirm("Release this claim? It goes back on the live feed for other NGOs to pick up.")) return;
    const reason = window.prompt('Optional: reason (shown to the donor)', '') || '';
    try {
      await client.post(`/listings/${id}/release`, { reason: reason || undefined });
      refresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not release this listing');
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
      setDocMessage("Document received — an admin will review it shortly.");
      setDocFile(null);
    } catch (err) {
      setDocMessage(err.response?.data?.message || 'Could not upload the document. Please try again.');
    } finally {
      setDocUploading(false);
    }
  }

  async function saveCapacity(e) {
    e.preventDefault();
    setCapacitySaving(true);
    setCapacityMessage('');
    try {
      const { data } = await client.patch('/auth/me', {
        dailyCapacityKg: capacityInput === '' ? null : capacityInput,
      });
      updateUser(data.user);
      setCapacityMessage('Saved — this now factors into your match scores.');
    } catch (err) {
      setCapacityMessage(err.response?.data?.message || 'Could not save your capacity.');
    } finally {
      setCapacitySaving(false);
    }
  }

  if (!user?.verified) {
    return (
      <DashboardShell title="Verification pending">
      <div className="max-w-xl mx-auto text-center py-12">
        <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-amber-dark bg-amber-light px-3 py-1.5 rounded-full mb-6">
          Verification pending
        </div>
        <h1 className="font-display text-2xl font-semibold mb-3">Your NGO is being verified</h1>
        <p className="text-ink/60">
          Once a platform admin verifies {user.orgName}, you'll start receiving real-time
          matches for surplus food near you.
        </p>

        {user.verificationDoc ? (
          <p className="text-sm text-rescue-dark bg-rescue/10 px-4 py-3 rounded-xl mt-8">
            We have your verification document on file — an admin will review it soon. You can upload a
            replacement below if needed.
          </p>
        ) : (
          <p className="text-sm text-claim bg-claim-light px-4 py-3 rounded-xl mt-8 text-left">
            We don't have a verification document on file for your account yet, so an admin can't confirm
            your organization. Please upload one below.
          </p>
        )}

        <form onSubmit={submitVerificationDoc} className="mt-6 text-left space-y-3">
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

  const kgComparison = monthComparison(claimed, (l) => l.quantityKg);
  const countComparison = monthComparison(claimed, () => 1);
  const awaitingPickup = claimed.filter(
    (l) => l.status === 'claimed' && l.claimedAt && Date.now() - new Date(l.claimedAt).getTime() > 90 * 60 * 1000
  );
  const [searchTerm, setSearchTerm] = useState('');
  const visibleAvailable = available.filter((l) =>
    !searchTerm.trim() || l.foodType.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  return (
    <DashboardShell title={user?.orgName} subtitle="Matched listings, claimed pickups, and your impact."
      search={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Search matched listings…">
      {impact && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatTile icon={Truck} label="Deliveries received" value={impact.donationsCompleted}
            accent="transit" sparkData={sparkFromClaims(claimed, () => 1)} />
          <StatTile icon={Leaf} label="Food received" value={impact.kgDiverted} suffix=" kg"
            accent="rescue" sparkData={sparkFromClaims(claimed, (l) => l.quantityKg)} />
          <StatTile icon={UtensilsCrossed} label="Meals served" value={impact.mealsSaved}
            accent="amber" sparkData={sparkFromClaims(claimed, (l) => Math.round(l.quantityKg * 2.5))} />
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-4 mb-6">
        <div className="bg-white border border-line rounded-2xl p-6">
          <h2 className="font-display text-lg font-semibold mb-1">Intake trend</h2>
          <p className="text-xs text-ink/40 mb-2">Kg received per week, last 5 weeks</p>
          <AreaTrendChart
            data={weeklyKgBuckets(claimed)}
            labels={['5w ago', '4w ago', '3w ago', '2w ago', 'This week']}
            color="#2F6F4E"
          />
        </div>
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-line rounded-2xl p-5">
            <h3 className="font-display text-base font-semibold mb-4">This month vs last</h3>
            <ComparisonBar label="Pickups completed" thisValue={countComparison.thisValue} lastValue={countComparison.lastValue} color="#2C6E8E" />
            <ComparisonBar label="Kg received" thisValue={kgComparison.thisValue} lastValue={kgComparison.lastValue} color="#2F6F4E" />
          </div>
          {awaitingPickup.length > 0 && (
            <AlertCard
              tone="amber"
              icon={Clock}
              title={`${awaitingPickup.length} pickup${awaitingPickup.length > 1 ? 's' : ''} awaiting collection`}
              body={`${awaitingPickup.map((l) => l.donor?.orgName).filter(Boolean).join(', ')} — claimed over 90 minutes ago, still not picked up.`}
            />
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5 mb-12">
        <RoutePlanner />
        <DemandHotspots />
      </div>

      <div className="bg-white border border-line rounded-2xl p-6 mb-12">
        <h2 className="font-display text-lg font-semibold mb-1">Daily capacity</h2>
        <p className="text-sm text-ink/60 mb-4">
          Roughly how much food (kg) {user?.orgName} can realistically handle in a day. This feeds directly
          into your match scores — without it, matching can't tell a donation is way bigger or smaller than
          what you can actually use.
        </p>
        <form onSubmit={saveCapacity} className="flex items-center gap-3 flex-wrap">
          <input
            type="number" min="1" step="1"
            value={capacityInput}
            onChange={(e) => setCapacityInput(e.target.value)}
            placeholder="e.g. 30"
            className="focus-ring w-32 px-4 py-2 rounded-xl border border-line"
          />
          <span className="text-sm text-ink/50">kg / day</span>
          <button type="submit" disabled={capacitySaving}
            className="focus-ring text-sm font-semibold px-4 py-2 rounded-full bg-rescue text-white hover:bg-rescue-dark disabled:opacity-60">
            {capacitySaving ? 'Saving…' : 'Save'}
          </button>
          {capacityMessage && <span className="text-sm text-ink/60">{capacityMessage}</span>}
        </form>
      </div>

      <h2 className="font-display text-xl font-semibold mb-4">Matched listings near you</h2>
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
          <ListingCardSkeleton count={3} />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
          {visibleAvailable.map((l) => (
            <div key={l._id} className="relative">
              <ListingCard listing={l} showMatch />
              <button
                onClick={(e) => { e.preventDefault(); claim(l._id); }}
                className="focus-ring absolute top-4 right-4 text-xs font-semibold px-3 py-1.5 rounded-full bg-rescue text-white hover:bg-rescue-dark shadow-sm"
              >
                Claim
              </button>
            </div>
          ))}
          {available.length === 0 && (
            <div className="col-span-full border border-dashed border-line rounded-2xl p-10 text-center">
              <RescueMark size={64} className="mx-auto mb-4" />
              <p className="text-ink/50">No open listings right now — new matches arrive here in real time.</p>
            </div>
          )}
          {available.length > 0 && visibleAvailable.length === 0 && (
            <div className="col-span-full border border-dashed border-line rounded-2xl p-10 text-center text-ink/50">
              No matched listings match "{searchTerm}".
            </div>
          )}
        </div>
      )}

      <h2 className="font-display text-xl font-semibold mb-4">Your claimed pickups</h2>
      <div className="space-y-3">
        {loading && <ListingRowSkeleton count={2} />}
        {!loading && claimed.filter((l) => ['claimed', 'picked_up'].includes(l.status)).map((l) => (
          <div key={l._id} className={`bg-white border border-line border-l-[3px] ${STATUS_ACCENT[l.status] || 'border-l-line'} rounded-2xl p-5 flex flex-col gap-1`}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="min-w-[220px]">
                <p className="font-medium">{l.foodType}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-ink/50">
                  <span className="inline-flex items-center gap-1"><Scale size={12} />{l.quantityKg} kg</span>
                  <span className="inline-flex items-center gap-1"><Store size={12} />{l.donor?.orgName}</span>
                  {l.donor?.phone && <span className="text-ink/35">{l.donor.phone}</span>}
                </div>
              </div>
              <RescueRail status={l.status} compact />
              <div className="flex gap-2">
                {l.status === 'claimed' && (
                  <>
                    <button onClick={() => markStatus(l._id, 'picked_up')}
                      className="focus-ring text-xs font-semibold px-3 py-1.5 rounded-full border border-line hover:border-ink/30">
                      Mark picked up
                    </button>
                    <button onClick={() => release(l._id)}
                      className="focus-ring text-xs font-semibold px-3 py-1.5 rounded-full border border-claim/40 text-claim hover:bg-claim-light">
                      Can't fulfil — release
                    </button>
                  </>
                )}
                {l.status === 'picked_up' && (
                  <button onClick={() => markStatus(l._id, 'delivered')}
                    className="focus-ring text-xs font-semibold px-3 py-1.5 rounded-full bg-rescue text-white hover:bg-rescue-dark">
                    Confirm delivered
                  </button>
                )}
                <a href={`/listings/${l._id}`}
                  className="focus-ring text-xs font-semibold px-3 py-1.5 rounded-full border border-line hover:border-ink/30">
                  Details
                </a>
              </div>
            </div>
            {l.status === 'claimed' && (
              courierByListing[l._id] ? (
                <CourierStatusBadge booking={courierByListing[l._id]}
                  onCancel={(booking) => cancelCourier(l._id, booking._id)} />
              ) : (
                <CourierBookingCard
                  listingId={l._id}
                  onBooked={(booking) => setCourierByListing((prev) => ({ ...prev, [l._id]: booking }))}
                />
              )
            )}
            {/* Once picked up, the courier's own status auto-synced to
                'picked_up' server-side the moment "Mark picked up" was
                clicked — show that as a settled confirmation, read-only. */}
            {l.status === 'picked_up' && courierByListing[l._id] && (
              <CourierStatusBadge booking={courierByListing[l._id]} />
            )}
          </div>
        ))}
        {!loading && claimed.filter((l) => ['claimed', 'picked_up'].includes(l.status)).length === 0 && (
          <div className="border border-dashed border-line rounded-2xl p-10 text-center text-ink/50">
            Nothing claimed yet — claim a match above to see pickup progress here.
          </div>
        )}
        {claimed.some((l) => l.status === 'cancelled') && (
          <p className="text-xs text-claim px-1 pt-2">
            Some of your recent claims were cancelled by the donor — check your notifications for details.
          </p>
        )}
      </div>

      <NGONeedsPanel />
      <MyReportsPanel />
    </DashboardShell>
  );
}
