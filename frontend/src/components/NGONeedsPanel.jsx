import { useEffect, useState } from 'react';
import client from '../api/client.js';
import { Plus, X } from 'lucide-react';

const FOOD_TYPES = ['Cooked meals', 'Bakery items', 'Packaged food', 'Fresh produce', 'Dairy', 'Other'];

const STATUS_STYLE = {
  open: 'bg-transit-light text-transit-dark',
  fulfilled: 'bg-rescue-light text-rescue-dark',
  cancelled: 'bg-line/60 text-ink/40',
};

/** Lets an NGO post what it actually needs (the reverse of a donor's
 * listing) and see the status of everything it's asked for. */
export default function NGONeedsPanel() {
  const [needs, setNeeds] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ foodType: FOOD_TYPES[0], quantityKg: '', hoursUntilNeeded: '24', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function refresh() {
    client.get('/needs/mine').then(({ data }) => setNeeds(data.needs)).catch(() => {});
  }

  useEffect(refresh, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const neededBy = new Date(Date.now() + parseFloat(form.hoursUntilNeeded) * 3600 * 1000);
      await client.post('/needs', {
        foodType: form.foodType,
        quantityKg: parseFloat(form.quantityKg),
        neededBy,
        notes: form.notes || undefined,
      });
      setForm((f) => ({ ...f, quantityKg: '', notes: '' }));
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not post this need.');
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelNeed(id) {
    if (!window.confirm('Cancel this need? Donors will no longer see it on the board.')) return;
    try {
      await client.patch(`/needs/${id}/cancel`);
      refresh();
    } catch (err) {
      window.alert(err.response?.data?.message || 'Could not cancel this need.');
    }
  }

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Your needs board posts</h2>
          <p className="text-xs text-ink/50 mt-0.5">Tell donors what you're short on — they can respond directly.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)}
          className="focus-ring inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-transit text-white text-sm font-semibold hover:bg-transit-dark transition-colors">
          <Plus size={15} strokeWidth={2.5} />
          {showForm ? 'Cancel' : 'Post a need'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-line rounded-2xl p-5 mb-4 space-y-4">
          {error && <p className="text-sm text-claim bg-claim-light px-3 py-2 rounded-lg">{error}</p>}
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5">Food type</label>
              <select value={form.foodType} onChange={(e) => setForm((f) => ({ ...f, foodType: e.target.value }))}
                className="focus-ring w-full px-3 py-2 rounded-lg border border-line text-sm">
                {FOOD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5">Quantity needed (kg)</label>
              <input type="number" min="1" required value={form.quantityKg}
                onChange={(e) => setForm((f) => ({ ...f, quantityKg: e.target.value }))}
                className="focus-ring w-full px-3 py-2 rounded-lg border border-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5">Needed within</label>
              <select value={form.hoursUntilNeeded} onChange={(e) => setForm((f) => ({ ...f, hoursUntilNeeded: e.target.value }))}
                className="focus-ring w-full px-3 py-2 rounded-lg border border-line text-sm">
                <option value="12">12 hours</option>
                <option value="24">1 day</option>
                <option value="72">3 days</option>
                <option value="168">1 week</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">Notes <span className="text-ink/40 font-normal">(optional)</span></label>
            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. for a 100-person community lunch on Saturday"
              className="focus-ring w-full px-3 py-2 rounded-lg border border-line text-sm" />
          </div>
          <button type="submit" disabled={submitting}
            className="focus-ring px-5 py-2 rounded-full bg-transit text-white text-sm font-semibold hover:bg-transit-dark disabled:opacity-60">
            {submitting ? 'Posting…' : 'Post to the needs board'}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {needs.map((n) => {
          const isExpired = n.status === 'open' && new Date(n.neededBy).getTime() < Date.now();
          return (
          <div key={n._id} className="bg-white border border-line rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium">{n.foodType} · {n.quantityKg}kg</p>
              <p className="text-xs text-ink/50 mt-0.5">
                Needed by {new Date(n.neededBy).toLocaleDateString()}
                {n.status === 'fulfilled' && n.fulfilledByListing && ` · fulfilled by a ${n.fulfilledByListing.quantityKg}kg listing`}
                {isExpired && ' · deadline passed, no longer shown on the board'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                isExpired ? 'bg-line/60 text-ink/40' : STATUS_STYLE[n.status]
              }`}>
                {isExpired ? 'expired' : n.status}
              </span>
              {n.status === 'open' && !isExpired && (
                <button onClick={() => cancelNeed(n._id)} className="focus-ring text-ink/30 hover:text-claim" aria-label="Cancel need">
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          );
        })}
        {needs.length === 0 && !showForm && (
          <p className="text-sm text-ink/40 px-1">Nothing posted yet — let donors know what you're short on.</p>
        )}
      </div>
    </section>
  );
}
