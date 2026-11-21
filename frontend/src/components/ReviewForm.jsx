import { useEffect, useState } from 'react';
import client from '../api/client.js';

/** Shown on a delivered listing so the donor/NGO can rate the other party. */
export default function ReviewForm({ listingId, otherPartyName }) {
  const [existing, setExisting] = useState(undefined); // undefined = loading, null = none yet
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get(`/reviews/listing/${listingId}/mine`)
      .then(({ data }) => setExisting(data.review))
      .catch(() => setExisting(null));
  }, [listingId]);

  async function submit(e) {
    e.preventDefault();
    if (!rating) { setError('Pick a star rating first.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await client.post('/reviews', { listingId, rating, comment });
      setExisting(data.review);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit review.');
    } finally {
      setSubmitting(false);
    }
  }

  if (existing === undefined) return null;

  if (existing) {
    return (
      <div className="bg-white border border-line rounded-2xl p-5">
        <p className="text-sm font-semibold mb-1">You rated {otherPartyName}</p>
        <div className="flex gap-0.5 mb-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={n <= existing.rating ? 'text-yellow-500' : 'text-ink/15'}>★</span>
          ))}
        </div>
        {existing.comment && <p className="text-sm text-ink/60">"{existing.comment}"</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-white border border-line rounded-2xl p-5">
      <p className="text-sm font-semibold mb-3">Rate {otherPartyName}</p>
      <div className="flex gap-1 mb-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="focus-ring text-2xl leading-none"
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >
            <span className={n <= (hover || rating) ? 'text-yellow-500' : 'text-ink/15'}>★</span>
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment — how did the handoff go?"
        maxLength={500}
        rows={2}
        className="focus-ring w-full px-3 py-2 rounded-xl border border-line bg-white text-sm mb-3"
      />
      {error && <p className="text-xs text-claim mb-2">{error}</p>}
      <button type="submit" disabled={submitting}
        className="focus-ring px-4 py-2 rounded-full bg-rescue text-white text-sm font-semibold hover:bg-rescue-dark disabled:opacity-60">
        {submitting ? 'Submitting…' : 'Submit review'}
      </button>
    </form>
  );
}
