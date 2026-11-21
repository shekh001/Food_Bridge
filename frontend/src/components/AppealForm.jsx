import { useState } from 'react';
import client from '../api/client.js';

/** Shown on the login page after a suspended-account redirect. Reachable
 * without a valid token (a suspended account can't get one), so this hits
 * the public /api/appeals endpoint by email instead. */
export default function AppealForm({ prefillEmail }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(prefillEmail || '');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !message.trim()) { setError('Please fill in both fields.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await client.post('/appeals', { email: email.trim(), message: message.trim() });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit your appeal.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-4 bg-white border border-line rounded-2xl p-4 text-sm">
        <p className="font-semibold mb-1">Appeal submitted</p>
        <p className="text-ink/60">An admin will review it. You'll be able to log in again if it's approved.</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="focus-ring text-sm font-medium text-rescue hover:underline mt-2">
        Think this was a mistake? Appeal this suspension
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 bg-white border border-line rounded-2xl p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium mb-1">Account email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="focus-ring w-full px-3 py-2 rounded-xl border border-line bg-white text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Why should this be reconsidered?</label>
        <textarea required rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)}
          className="focus-ring w-full px-3 py-2 rounded-xl border border-line bg-white text-sm"
          placeholder="Explain what happened, from your side." />
      </div>
      {error && <p className="text-xs text-claim">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={submitting}
          className="focus-ring px-4 py-2 rounded-full bg-rescue text-white text-sm font-semibold hover:bg-rescue-dark disabled:opacity-60">
          {submitting ? 'Submitting…' : 'Submit appeal'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="focus-ring px-4 py-2 rounded-full text-sm font-medium text-ink/50 hover:text-ink/70">
          Cancel
        </button>
      </div>
    </form>
  );
}
