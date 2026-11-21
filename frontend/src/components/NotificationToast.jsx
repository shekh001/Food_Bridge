import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Turns select real-time socket events into small, auto-dismissing toast
// popups so a fact like "new food posted 1.2km away" or "your listing was
// claimed" is actually SEEN in the moment, not just silently logged to a
// notifications array nobody's looking at. Deliberately picky about which
// event kinds become a toast — 'removed' and the raw 'new_listing' feed
// event are used elsewhere (to live-update lists) but would be noisy spam
// as popups once there are many NGOs/listings on the platform.
function toastFor(entry, role) {
  const { kind, payload } = entry;

  if (kind === 'new_match' && role === 'ngo') {
    return {
      title: `New match nearby (${payload.distanceKm?.toFixed?.(1) ?? '?'} km)`,
      body: `${payload.listing?.foodType} from ${payload.listing?.donor?.orgName}`,
      url: payload.listing?._id ? `/listings/${payload.listing._id}` : null,
      tone: 'rescue',
    };
  }
  if (kind === 'claimed' && role === 'donor') {
    return {
      title: 'Your listing was claimed!',
      body: `${payload.claimedBy?.orgName} is picking it up.`,
      url: payload.listingId ? `/listings/${payload.listingId}` : null,
      tone: 'rescue',
    };
  }
  if (kind === 'status_update') {
    const label = { picked_up: 'marked as picked up', delivered: 'confirmed delivered', cancelled: 'cancelled' }[payload.status] || payload.status;
    return {
      title: 'Pickup update',
      body: `A donation was ${label}.`,
      url: payload.listingId ? `/listings/${payload.listingId}` : null,
      tone: 'amber',
    };
  }
  if (kind === 'courier_assigned') {
    return {
      title: 'Courier booked for pickup',
      body: `${payload.courierName} is on the way — ETA ~${payload.etaMinutes} min.`,
      url: payload.listingId ? `/listings/${payload.listingId}` : null,
      tone: 'amber',
    };
  }
  if (kind === 'courier_cancelled') {
    return {
      title: 'Courier booking cancelled',
      body: 'The pickup courier that was booked is no longer coming.',
      url: payload.listingId ? `/listings/${payload.listingId}` : null,
      tone: 'amber',
    };
  }
  if (kind === 'need_posted' && role === 'donor') {
    return {
      title: 'An NGO posted a new need',
      body: `${payload.ngoOrgName} needs ${payload.foodType} (${payload.quantityKg}kg).`,
      url: '/needs',
      tone: 'amber',
    };
  }
  if (kind === 'need_fulfilled') {
    return {
      title: 'A donor responded to your need',
      body: 'Check the listing they posted for you.',
      url: payload.listingId ? `/listings/${payload.listingId}` : null,
      tone: 'amber',
    };
  }
  return null;
}

export default function NotificationToast() {
  const { notifications } = useSocket();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);
  const seenIds = useRef(new Set());

  useEffect(() => {
    const latest = notifications[0];
    if (!latest || seenIds.current.has(latest.id)) return;
    seenIds.current.add(latest.id);

    const content = toastFor(latest, user?.role);
    if (!content) return;

    const toastId = latest.id;
    setToasts((prev) => [{ id: toastId, ...content }, ...prev].slice(0, 4));
    setTimeout(() => dismiss(toastId), 6000);
  }, [notifications, user?.role]);

  // Two-step removal: mark as leaving (triggers the CSS exit transition),
  // then actually drop it from state once that transition has had time to
  // play — an abrupt array-filter with no exit animation reads as a glitch,
  // not a dismissal.
  function dismiss(id) {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-[min(90vw,340px)]">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => {
            if (t.url) navigate(t.url);
            dismiss(t.id);
          }}
          className={`focus-ring text-left bg-white border rounded-2xl shadow-lg p-4 hover:-translate-y-0.5 transition-transform ${
            t.leaving ? 'toast-leaving' : 'toast-enter'
          } ${t.tone === 'amber' ? 'border-amber' : 'border-rescue/40'}`}
        >
          <p className="text-sm font-semibold text-ink">{t.title}</p>
          <p className="text-xs text-ink/60 mt-0.5">{t.body}</p>
        </button>
      ))}
    </div>
  );
}
