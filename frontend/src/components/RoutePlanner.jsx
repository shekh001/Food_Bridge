import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import client from '../api/client.js';

/**
 * Multi-stop pickup route optimizer. Calls the backend, which delegates the
 * actual ordering to OSRM's free public trip service — this component just
 * renders whatever comes back (ordered stop list + route line on a map).
 */
export default function RoutePlanner() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function optimize() {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/routes/optimize');
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not compute a route right now.');
    } finally {
      setLoading(false);
    }
  }

  const polyline = result?.geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) || [];
  const center = polyline[0] || [28.6139, 77.209];

  return (
    <div className="bg-white border border-line rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold">Optimize today's pickup route</p>
          <p className="text-xs text-ink/40">Orders your pending pickups by shortest total travel time.</p>
        </div>
        <button onClick={optimize} disabled={loading}
          className="focus-ring text-xs font-semibold px-4 py-2 rounded-full bg-rescue text-white hover:bg-rescue-dark disabled:opacity-60 whitespace-nowrap">
          {loading ? 'Calculating…' : 'Optimize route'}
        </button>
      </div>

      {error && <p className="text-xs text-claim mb-3">{error}</p>}

      {result && (
        <>
          {result.message && <p className="text-xs text-ink/50 mb-3">{result.message}</p>}

          {result.stops.length > 0 && (
            <>
              {(result.distanceKm != null) && (
                <p className="text-xs text-ink/50 mb-3">
                  ~{result.distanceKm} km · ~{result.durationMin} min total driving
                </p>
              )}

              <ol className="space-y-2 mb-4">
                {result.stops.map((s) => (
                  <li key={s.listing._id} className="flex items-start gap-3 text-sm">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-rescue text-white text-xs font-semibold flex items-center justify-center">
                      {s.order}
                    </span>
                    <div>
                      <p className="font-medium">{s.listing.foodType} · {s.listing.quantityKg}kg</p>
                      <p className="text-xs text-ink/50">{s.listing.donor?.orgName} — {s.listing.pickupLocation.address}</p>
                    </div>
                  </li>
                ))}
              </ol>

              {polyline.length > 0 && (
                <div className="h-56 w-full rounded-xl overflow-hidden border border-line">
                  <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Polyline positions={polyline} pathOptions={{ color: '#e8590c', weight: 4 }} />
                    {result.stops.map((s) => (
                      <Marker key={s.listing._id} position={[s.listing.pickupLocation.lat, s.listing.pickupLocation.lng]}>
                        <Popup>Stop {s.order}: {s.listing.foodType}</Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
