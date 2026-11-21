import { useEffect, useState } from 'react';
import client from '../api/client.js';
import StatCounter from '../components/StatCounter.jsx';

export default function Impact() {
  const [impact, setImpact] = useState(null);

  useEffect(() => {
    client.get('/impact').then(({ data }) => setImpact(data)).catch(() => {});
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <p className="text-xs font-mono uppercase tracking-wide text-ink/40 mb-2">Platform-wide</p>
      <h1 className="font-display text-3xl md:text-4xl font-semibold mb-3">Real impact, in real numbers</h1>
      <p className="text-ink/60 max-w-lg mb-12">
        Every figure below is computed from confirmed deliveries only — no estimates from
        pending or in-transit donations.
      </p>

      {impact ? (
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="bg-white border border-line rounded-2xl p-8">
            <StatCounter value={impact.mealsSaved} label="Estimated meals provided" />
          </div>
          <div className="bg-white border border-line rounded-2xl p-8">
            <StatCounter value={impact.kgDiverted} label="KG of food diverted from landfill" suffix=" kg" />
          </div>
          <div className="bg-white border border-line rounded-2xl p-8">
            <StatCounter value={impact.co2eKgAvoided} label="KG of CO2e avoided" suffix=" kg" />
          </div>
          <div className="bg-white border border-line rounded-2xl p-8">
            <StatCounter value={impact.donationsCompleted} label="Donations completed end-to-end" />
          </div>
        </div>
      ) : (
        <div className="text-ink/40 text-sm">Loading…</div>
      )}

      <div className="mt-10 text-xs text-ink/40 font-mono leading-relaxed">
        Methodology: 2.5 meals per kg of food, 2.5 kg CO2e avoided per kg diverted from landfill —
        standard estimates used across food-rescue reporting.
      </div>
    </div>
  );
}
