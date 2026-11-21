import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import client from '../api/client.js';
import RescueRail from '../components/RescueRail.jsx';
import ChatBox from '../components/ChatBox.jsx';
import ReviewForm from '../components/ReviewForm.jsx';
import ReportForm from '../components/ReportForm.jsx';
import LiveTrackingMap from '../components/LiveTrackingMap.jsx';
import ShareLocationToggle from '../components/ShareLocationToggle.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import AuthImage from '../components/AuthImage.jsx';

export default function ListingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { notifications } = useSocket();
  const [listing, setListing] = useState(null);
  const [error, setError] = useState('');
  const [claimNotice, setClaimNotice] = useState('');
  const [claiming, setClaiming] = useState(false);

  async function refresh() {
    try {
      const { data } = await client.get(`/listings/${id}`);
      setListing(data.listing);
    } catch (err) {
      setError('Listing not found.');
    }
  }

  useEffect(() => { refresh(); }, [id]);

  // If someone else claims THIS exact listing while it's open on screen,
  // reflect that immediately rather than leaving a stale "Claim" button up.
  useEffect(() => {
    const latest = notifications[0];
    if (latest?.kind === 'removed' && latest.payload?.listingId === id) {
      refresh();
      setClaimNotice('This listing was just claimed by another NGO.');
    }
  }, [notifications, id]);

  async function claim() {
    setClaiming(true);
    setClaimNotice('');
    try {
      await client.post(`/listings/${id}/claim`);
      await refresh();
    } catch (err) {
      // Someone else could have claimed this in the moment between the page
      // loading and this click — re-fetch so the button/status shown
      // actually reflects reality instead of staying stuck on "Claim this
      // listing" for something that's already gone.
      await refresh();
      setClaimNotice(
        err.response?.status === 409
          ? "Too slow — another NGO already claimed this listing. Check the live feed for others nearby."
          : (err.response?.data?.message || 'Could not claim this listing.'),
      );
    } finally {
      setClaiming(false);
    }
  }

  async function markStatus(status) {
    await client.patch(`/listings/${id}/status`, { status });
    refresh();
  }

  async function cancelListing() {
    const confirmMsg = listing.status === 'claimed'
      ? `${listing.claimedBy?.orgName || 'The NGO that claimed this'} will be notified that this donation is cancelled. Continue?`
      : "Cancel this listing? It will be removed from every NGO's feed.";
    if (!window.confirm(confirmMsg)) return;
    const reason = window.prompt('Optional: reason for cancelling (shown to the NGO if already claimed)', '') || '';
    try {
      await client.patch(`/listings/${id}/status`, { status: 'cancelled', notes: reason || undefined });
      await refresh();
    } catch (err) {
      setClaimNotice(err.response?.data?.message || 'Could not cancel this listing.');
    }
  }

  async function releaseClaim() {
    if (!window.confirm("Release this claim? It goes back on the live feed for other NGOs to pick up.")) return;
    const reason = window.prompt('Optional: reason (shown to the donor)', '') || '';
    try {
      await client.post(`/listings/${id}/release`, { reason: reason || undefined });
      await refresh();
    } catch (err) {
      setClaimNotice(err.response?.data?.message || 'Could not release this listing.');
    }
  }

  if (error) return <div className="max-w-2xl mx-auto px-6 py-24 text-center text-ink/50">{error}</div>;
  if (!listing) return <div className="max-w-2xl mx-auto px-6 py-24 text-center text-ink/30">Loading…</div>;

  const isDonor = user && String(listing.donor?._id) === String(user._id);
  const isClaimant = user && listing.claimedBy && String(listing.claimedBy._id) === String(user._id);

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <p className="text-xs font-mono uppercase tracking-wide text-ink/40 mb-2">Listing</p>
      <h1 className="font-display text-3xl font-semibold mb-1">{listing.foodType}</h1>
      <p className="text-ink/60 flex items-center gap-1.5">
        {listing.donor?.orgName}
        {listing.donor?.orgType === 'individual' && (
          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-ink/10 text-ink/50">Individual</span>
        )}
      </p>

      {listing.photo && (
        <div className="mt-6 h-64 rounded-2xl overflow-hidden border border-line bg-paper">
          <AuthImage
            src={`/listings/${listing._id}/photo/${encodeURIComponent(listing.photo)}`}
            alt={listing.foodType}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="mt-8 bg-white border border-line rounded-2xl p-6">
        <RescueRail status={listing.status} />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="bg-white border border-line rounded-xl p-4">
          <div className="text-lg font-mono font-semibold">{listing.quantityKg} kg</div>
          <div className="text-xs text-ink/50">Quantity</div>
        </div>
        <div className="bg-white border border-line rounded-xl p-4">
          <div className="text-lg font-mono font-semibold">~{listing.servingsEstimate}</div>
          <div className="text-xs text-ink/50">Meals</div>
        </div>
        <div className="bg-white border border-line rounded-xl p-4">
          <div className="text-lg font-mono font-semibold">{new Date(listing.expiryAt).toLocaleTimeString()}</div>
          <div className="text-xs text-ink/50">Pickup by</div>
        </div>
      </div>

      {listing.description && <p className="mt-6 text-ink/70">{listing.description}</p>}

      <div className="mt-6 text-sm text-ink/60">
        <p className="font-medium text-ink">Pickup location</p>
        <p>{listing.pickupLocation.address}</p>
      </div>

      {listing.claimedBy && (
        <div className="mt-6 text-sm text-ink/60">
          <p className="font-medium text-ink">Claimed by</p>
          <p>{listing.claimedBy.orgName} {listing.claimedBy.phone && `· ${listing.claimedBy.phone}`}</p>
        </div>
      )}

      {claimNotice && (
        <div className="mt-6 text-sm text-claim bg-claim-light px-4 py-3 rounded-xl">{claimNotice}</div>
      )}

      <div className="mt-10 flex gap-3">
        {user?.role === 'ngo' && listing.status === 'posted' && (
          <button onClick={claim} disabled={claiming}
            className="focus-ring px-6 py-2.5 rounded-full bg-rescue text-white font-semibold hover:bg-rescue-dark disabled:opacity-60">
            {claiming ? 'Claiming…' : 'Claim this listing'}
          </button>
        )}
        {isDonor && ['posted', 'claimed'].includes(listing.status) && (
          <button onClick={cancelListing}
            className="focus-ring px-6 py-2.5 rounded-full border border-claim/40 text-claim font-semibold hover:bg-claim-light">
            Cancel this listing
          </button>
        )}
        {isClaimant && listing.status === 'claimed' && (
          <>
            <button onClick={() => markStatus('picked_up')} className="focus-ring px-6 py-2.5 rounded-full border border-line font-semibold hover:border-ink/30">
              Mark picked up
            </button>
            <button onClick={releaseClaim} className="focus-ring px-6 py-2.5 rounded-full border border-claim/40 text-claim font-semibold hover:bg-claim-light">
              Can't fulfil — release
            </button>
          </>
        )}
        {(isDonor || isClaimant) && listing.status === 'picked_up' && (
          <button onClick={() => markStatus('delivered')} className="focus-ring px-6 py-2.5 rounded-full bg-rescue text-white font-semibold hover:bg-rescue-dark">
            Confirm delivered
          </button>
        )}
      </div>

      {(isDonor || isClaimant) && ['claimed', 'picked_up'].includes(listing.status) && (
        <div className="mt-8 space-y-4">
          <LiveTrackingMap
            listingId={listing._id}
            pickupLocation={listing.pickupLocation}
            initialLiveLocation={listing.liveLocation}
          />
          {isClaimant && <ShareLocationToggle listingId={listing._id} />}
        </div>
      )}

      {(isDonor || isClaimant) && ['claimed', 'picked_up'].includes(listing.status) && (
        <div className="mt-8">
          <ChatBox listingId={listing._id} />
        </div>
      )}

      {(isDonor || isClaimant) && listing.status === 'delivered' && (
        <div className="mt-8">
          <ReviewForm
            listingId={listing._id}
            otherPartyName={isDonor ? listing.claimedBy?.orgName : listing.donor?.orgName}
          />
        </div>
      )}

      {(isDonor || isClaimant) && listing.claimedBy && (
        <div className="mt-6">
          <ReportForm
            listingId={listing._id}
            otherPartyName={isDonor ? listing.claimedBy?.orgName : listing.donor?.orgName}
          />
        </div>
      )}
    </div>
  );
}
