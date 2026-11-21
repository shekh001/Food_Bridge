import { useEffect, useState } from 'react';
import client from '../api/client.js';

/**
 * Shows current plan + upgrade CTA. In demo mode (no Razorpay keys on the
 * backend) the "payment" is explicitly simulated — labeled as such so it's
 * never mistaken for a real charge. In live mode it opens Razorpay Checkout
 * and verifies the signature server-side before granting Pro.
 */
export default function UpgradeCard({ onUpgraded }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/billing/status').then(({ data }) => setStatus(data)).catch(() => {});
  }, []);

  async function startUpgrade() {
    setLoading(true);
    setError('');
    try {
      const { data: order } = await client.post('/billing/create-order');

      if (order.demoMode) {
        const ok = window.confirm(
          `DEMO MODE — no payment gateway is configured on this server, so no real money moves.\n\n` +
          `Simulate paying ₹${order.amountInr}/month for FoodBridge Pro?`
        );
        if (!ok) { setLoading(false); return; }
        const { data } = await client.post('/billing/confirm-demo-upgrade');
        setStatus((s) => ({ ...s, plan: data.user.plan }));
        onUpgraded?.(data.user);
        return;
      }

      // Live mode: open Razorpay Checkout (script must be loaded once, e.g. in index.html).
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.order.amount,
        currency: order.order.currency,
        order_id: order.order.id,
        name: 'FoodBridge Pro',
        description: 'Monthly subscription — consolidated CSR reports',
        handler: async (response) => {
          const { data } = await client.post('/billing/verify', response);
          setStatus((s) => ({ ...s, plan: data.user.plan }));
          onUpgraded?.(data.user);
        },
      });
      rzp.open();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start upgrade.');
    } finally {
      setLoading(false);
    }
  }

  if (!status) return null;
  if (status.plan === 'pro') {
    return (
      <div className="bg-rescue-light border border-rescue/20 rounded-2xl p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-rescue-dark">✓ FoodBridge Pro</p>
          <p className="text-xs text-ink/50 mt-0.5">Consolidated CSR reports unlocked.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-line rounded-2xl p-5 flex items-center justify-between flex-wrap gap-4">
      <div>
        <p className="text-sm font-semibold">Upgrade to FoodBridge Pro — ₹{status.priceInr}/mo</p>
        <p className="text-xs text-ink/50 mt-0.5">
          Unlock consolidated, branded CSR reports across all your donations for tax/compliance filing.
          {!status.liveMode && ' (Demo mode — no real payment gateway is connected yet.)'}
        </p>
        {error && <p className="text-xs text-claim mt-1">{error}</p>}
      </div>
      <button onClick={startUpgrade} disabled={loading}
        className="focus-ring text-xs font-semibold px-4 py-2 rounded-full bg-amber text-ink hover:bg-amber-dark disabled:opacity-60 whitespace-nowrap">
        {loading ? 'Please wait…' : 'Upgrade to Pro'}
      </button>
    </div>
  );
}
