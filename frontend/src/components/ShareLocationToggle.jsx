import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext.jsx';

/**
 * Shown only to the person actually carrying the food (the claiming NGO /
 * volunteer) while status is 'claimed' or 'picked_up'. Uses the browser's
 * Geolocation.watchPosition to stream device GPS over the socket — this is
 * the sending half; LiveTrackingMap is the read-only receiving half shown
 * to the donor.
 */
export default function ShareLocationToggle({ listingId }) {
  const { socket } = useSocket();
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const watchIdRef = useRef(null);
  const lastSentRef = useRef(0);

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setError('');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSentRef.current < 4000) return; // client-side throttle, mirrors server's
        lastSentRef.current = now;
        socket?.emit('location:update', {
          listingId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => setError('Could not read your location \u2014 check location permission for this site.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    setSharing(true);
  }

  function stop() {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (sharing) socket?.emit('location:stop', listingId);
    setSharing(false);
  }

  return (
    <div className="bg-white border border-line rounded-2xl p-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold">Share your live location</p>
        <p className="text-xs text-ink/40 mt-0.5">
          {sharing
            ? 'Broadcasting your position to the donor while you\u2019re en route.'
            : 'Let the donor see your position on the way to pickup or delivery.'}
        </p>
        {error && <p className="text-xs text-claim mt-1">{error}</p>}
      </div>
      <button
        onClick={() => (sharing ? stop() : start())}
        className={`focus-ring shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
          sharing ? 'bg-claim text-white hover:bg-claim/90' : 'bg-rescue text-white hover:bg-rescue-dark'
        }`}
      >
        {sharing ? 'Stop sharing' : 'Start sharing'}
      </button>
    </div>
  );
}
