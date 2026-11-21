import { useState } from 'react';
import client from '../api/client.js';

const REASONS = [
  { value: 'no_show', label: "Didn't show up / no response" },
  { value: 'fraud_or_fake', label: 'Looks fake or fraudulent' },
  { value: 'unsafe_or_bad_quality', label: 'Unsafe or bad quality food' },
  { value: 'unresponsive', label: 'Went silent mid-coordination' },
  { value: 'other', label: 'Something else' },
];

/** Lets the donor or claiming NGO on a listing report the other party to admins. */
export default function ReportForm({ listingId, otherPartyName }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleFiles(e) {
    const picked = Array.from(e.target.files || []).slice(0, 3);
    setFiles(picked);
  }

  async function submit(e) {
    e.preventDefault();
    if (!reason) { setError('Pick a reason first.'); return; }
    if (!description.trim()) { setError('Please add a short description of what happened.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('listingId', listingId);
      formData.append('reason', reason);
      formData.append('description', description.trim());
      files.forEach((f) => formData.append('evidence', f));
      await client.post('/reports', formData);
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit the report.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-white border border-line rounded-2xl p-5 text-sm">
        <p className="font-semibold mb-1">Report submitted</p>
        <p className="text-ink/60">An admin will review this. Thanks for flagging it.</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="focus-ring text-xs font-medium text-ink/40 hover:text-claim underline underline-offset-2">
        Something went wrong with {otherPartyName || 'this donation'}? Report it
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="bg-white border border-line rounded-2xl p-5">
      <p className="text-sm font-semibold mb-3">Report {otherPartyName || 'the other party'}</p>
      <div className="space-y-1.5 mb-3">
        {REASONS.map((r) => (
          <label key={r.value} className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="report-reason" value={r.value}
              checked={reason === r.value}
              onChange={(e) => setReason(e.target.value)}
              className="accent-claim" />
            {r.label}
          </label>
        ))}
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What happened? Include any relevant details."
        maxLength={1000}
        rows={3}
        className="focus-ring w-full px-3 py-2 rounded-xl border border-line bg-white text-sm mb-3"
      />
      <div className="mb-3">
        <label className="block text-xs font-medium text-ink/50 mb-1.5">
          Photos or documents (optional, up to 3 — JPG/PNG/WEBP/PDF, 5MB each)
        </label>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple onChange={handleFiles}
          className="focus-ring w-full text-xs text-ink/60 file:mr-3 file:px-3 file:py-1.5 file:rounded-full file:border-0 file:bg-ink/[0.06] file:text-xs file:font-medium file:cursor-pointer" />
        {files.length > 0 && (
          <p className="text-xs text-ink/40 mt-1">{files.length} file{files.length > 1 ? 's' : ''} selected</p>
        )}
      </div>
      {error && <p className="text-xs text-claim mb-2">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={submitting}
          className="focus-ring px-4 py-2 rounded-full bg-claim text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60">
          {submitting ? 'Submitting…' : 'Submit report'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="focus-ring px-4 py-2 rounded-full text-sm font-medium text-ink/50 hover:text-ink/70">
          Cancel
        </button>
      </div>
    </form>
  );
}
