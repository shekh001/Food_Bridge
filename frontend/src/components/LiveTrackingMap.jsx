import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSocket } from '../context/SocketContext.jsx';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// A small pulsing amber dot for the "live" mover — visually distinct from the
// static default pin so it reads as "moving thing" vs "fixed place" at a glance.
const liveIcon = L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:22px;height:22px;">
      <div style="position:absolute;inset:0;background:#F2A93B;border-radius:999px;opacity:0.35;animation:fb-pulse 1.6s ease-out infinite;"></div>
      <div style="position:absolute;top:5px;left:5px;width:12px;height:12px;background:#F2A93B;border:2px solid white;border-radius:999px;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>
    </div>
    <style>@keyframes fb-pulse{0%{transform:scale(0.6);opacity:0.5}100%{transform:scale(2.2);opacity:0}}</style>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function FitBoth({ a, b }) {
  const map = useMap();
  useEffect(() => {
    if (!a || !b) return;
    map.fitBounds([[a.lat, a.lng], [b.lat, b.lng]], { padding: [40, 40], maxZoom: 15 });
  }, [a, b]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function timeAgo(date) {
  if (!date) return null;
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

/**
 * Read-only live map for whoever is NOT carrying the food — the donor
 * watching their donation head out, or the claimant confirming their own
 * signal is coming through. Purely a viewer; sending updates is
 * ShareLocationToggle's job.
 */
export default function LiveTrackingMap({ listingId, pickupLocation, initialLiveLocation }) {
  const { socket } = useSocket();
  const [live, setLive] = useState(initialLiveLocation?.lat ? initialLiveLocation : null);
  const [stopped, setStopped] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!socket || !listingId) return;
    socket.emit('chat:join', listingId); // same authorized room chat already uses

    function onUpdate(payload) {
      if (String(payload.listingId) !== String(listingId)) return;
      setStopped(false);
      setLive({ lat: payload.lat, lng: payload.lng, updatedAt: payload.updatedAt });
    }
    function onStopped(payload) {
      if (String(payload.listingId) !== String(listingId)) return;
      setStopped(true);
    }

    socket.on('location:update', onUpdate);
    socket.on('location:stopped', onStopped);
    return () => {
      socket.off('location:update', onUpdate);
      socket.off('location:stopped', onStopped);
    };
  }, [socket, listingId]);

  // Re-render every 10s just so the "updated Xs ago" label stays fresh.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  const hasLive = live && Number.isFinite(live.lat) && Number.isFinite(live.lng);
  const center = hasLive ? [live.lat, live.lng] : [pickupLocation.lat, pickupLocation.lng];

  return (
    <div className="bg-white border border-line rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Live pickup tracking</p>
          <p className="text-xs text-ink/40">
            {hasLive && !stopped
              ? `Location shared \u00b7 updated ${timeAgo(live.updatedAt)}`
              : stopped
              ? 'Volunteer stopped sharing their location'
              : 'Waiting for the volunteer to start sharing location'}
          </p>
        </div>
        {hasLive && !stopped && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-dark">
            <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" /> Live
          </span>
        )}
      </div>

      <div className="h-64 w-full">
        <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[pickupLocation.lat, pickupLocation.lng]} />
          {hasLive && <Marker position={[live.lat, live.lng]} icon={liveIcon} />}
          {hasLive && <FitBoth a={pickupLocation} b={live} />}
        </MapContainer>
      </div>
    </div>
  );
}
