import { useState } from 'react';
import client from '../api/client.js';

/**
 * Shown on the NGO dashboard for a claimed-but-not-yet-picked-up listing
 * that has no courier booked yet. Same demo/live payment split as
 * UpgradeCard.jsx: in demo mode the "payment" is explicitly simulated and
 * labeled as such; in live mode it opens Razorpay Checkout and verifies
 * server-side before a courier is assigned. Either way the courier
 * assignment itself is always simulated — there's no real delivery-partner
 * integration behind this yet.
 */
export default function CourierBookingCard({ listingId, onBooked }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function bookCourier() {
    setLoading(true);
    setError('');
    try {
      const { data: order } = await client.post(`/couriers/${listingId}/create-order`);

      if (order.demoMode) {
        const ok = window.confirm(
          `DEMO MODE — no payment gateway is configured on this server, so no real money moves.\n\n` +
          `Simulate paying ₹${order.amountInr} to book a pickup courier?`
        );
        if (!ok) { setLoading(false); return; }
        const { data } = await client.post(`/couriers/${listingId}/confirm-demo`);
        onBooked?.(data.booking);
        setLoading(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.order.amount,
        currency: order.order.currency,
        order_id: order.order.id,
        name: 'FoodBridge — pickup courier',
        description: 'One-time convenience fee for a booked courier pickup',
        handler: async (response) => {
          // This runs only after Razorpay has actually captured the
          // payment — if /verify then rejects (listing changed underneath
          // the NGO mid-checkout), the server has already refunded it, but
          // that message still needs to reach the screen instead of
          // vanishing into an unhandled promise rejection.
          try {
            const { data } = await client.post(`/couriers/${listingId}/verify`, response);
            onBooked?.(data.booking);
          } catch (err) {
            setError(err.response?.data?.message || 'Payment succeeded but the booking could not be completed — it has been refunded.');
          } finally {
            setLoading(false);
          }
        },
        modal: {
          // The NGO closed the Razorpay popup without paying — not an
          // error, just release the button back to normal.
          ondismiss: () => setLoading(false),
        },
      });
      rzp.open();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not book a courier right now.');
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 bg-amber-light/40 border border-amber/30 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <p className="text-xs font-semibold text-ink">No transport for this pickup?</p>
        <p className="text-[11px] text-ink/50 mt-0.5">A courier can collect it for you — ₹35 convenience fee.</p>
        {error && <p className="text-[11px] text-claim mt-1">{error}</p>}
      </div>
      <button onClick={bookCourier} disabled={loading}
        className="focus-ring text-xs font-semibold px-3 py-1.5 rounded-full bg-amber text-ink hover:bg-amber-dark disabled:opacity-60 whitespace-nowrap">
        {loading ? 'Booking…' : 'Book pickup courier'}
      </button>
    </div>
  );
}
