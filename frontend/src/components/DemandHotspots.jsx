import { useEffect, useState } from 'react';
import client from '../api/client.js';

/**
 * Shows historically busy (location, day, time) buckets from a plain
 * aggregation over past listings — not a trained model. Framed honestly as
 * a heuristic so it doesn't overclaim accuracy with the current small
 * amount of demo data.
 */
export default function DemandHotspots() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/predictions/hotspots')
      .then(({ data }) => setData(data))
      .catch(() => setData({ hotspots: [], message: 'Could not load predictions right now.' }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <div className="bg-white border border-line rounded-2xl p-5">
      <div className="mb-4">
        <p className="text-sm font-semibold">Predicted surplus hotspots</p>
        <p className="text-xs text-ink/40">
          Based on {data.sampleSize ?? 0} historical listings — a simple pattern heuristic, not a trained model.
        </p>
      </div>

      {data.hotspots.length === 0 && (
        <p className="text-xs text-ink/40">{data.message || 'Not enough data yet.'}</p>
      )}

      {data.hotspots.length > 0 && (
        <ul className="space-y-2">
          {data.hotspots.map((h, i) => (
            <li key={i} className="flex items-center justify-between text-sm border-t border-line first:border-0 pt-2 first:pt-0">
              <div>
                <p className="font-medium">{h.approxLocation}</p>
                <p className="text-xs text-ink/50">{h.dayOfWeek} · {h.timeWindow} · usually {h.likelySource}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-mono">{h.historicalListings}× seen</p>
                <p className="text-xs text-ink/40">~{h.avgQuantityKg}kg avg</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
