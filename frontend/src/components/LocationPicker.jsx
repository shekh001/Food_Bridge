import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker icons reference image paths that don't resolve under
// Vite's bundler — point them at a CDN instead so the pin actually renders.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER = [28.6139, 77.209]; // New Delhi — sensible fallback if geolocation is denied

/** Recenters the map whenever the parent's lat/lng changes (e.g. after a search or "use my location"). */
function RecenterOnChange({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) map.setView([lat, lng], map.getZoom());
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function ClickToPlace({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * Map-based location picker. Replaces raw lat/lng number inputs with:
 *  - a searchable address box (OpenStreetMap Nominatim geocoding, free/no key)
 *  - a "use my current location" button (browser Geolocation API)
 *  - a click-anywhere-on-the-map-to-drop-pin fallback
 *
 * Controlled component: parent owns { lat, lng } and receives updates via onChange.
 */
export default function LocationPicker({ lat, lng, onChange }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const debounceRef = useRef(null);

  const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);
  const center = hasPosition ? [lat, lng] : DEFAULT_CENTER;

  function useMyLocation() {
    if (!navigator.geolocation) {
      setSearchError('Geolocation is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSearchError('');
        onChange(pos.coords.latitude, pos.coords.longitude);
      },
      () => setSearchError('Could not get your location. Pick it on the map instead.'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function runSearch(text) {
    if (!text.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      // Free geocoding — no API key. Nominatim's usage policy asks for a light request rate,
      // which the debounce below respects.
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(text)}`
      );
      const results = await res.json();
      if (!results.length) {
        setSearchError('No matching location found. Try a more specific address.');
        return;
      }
      onChange(parseFloat(results[0].lat), parseFloat(results[0].lon));
    } catch {
      setSearchError('Search failed — check your connection and try again.');
    } finally {
      setSearching(false);
    }
  }

  function handleQueryChange(text) {
    setQuery(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), 600);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search an address…"
          className="focus-ring flex-1 px-4 py-2.5 rounded-xl border border-line bg-white text-sm"
        />
        <button
          type="button"
          onClick={useMyLocation}
          className="focus-ring px-4 py-2.5 rounded-xl border border-line bg-white text-sm font-medium hover:bg-ink/5 whitespace-nowrap"
        >
          📍 Use my location
        </button>
      </div>

      <div className="h-64 w-full rounded-xl overflow-hidden border border-line">
        <MapContainer center={center} zoom={hasPosition ? 14 : 11} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPlace onPick={onChange} />
          <RecenterOnChange lat={lat} lng={lng} />
          {hasPosition && <Marker position={[lat, lng]} />}
        </MapContainer>
      </div>

      <p className="text-xs text-ink/40">
        {searching
          ? 'Searching…'
          : hasPosition
          ? `Pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)} — click the map to adjust.`
          : 'Search an address, use your current location, or click the map to drop a pin.'}
      </p>
      {searchError && <p className="text-xs text-claim">{searchError}</p>}
    </div>
  );
}
