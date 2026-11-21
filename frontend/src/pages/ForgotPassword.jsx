import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await forgotPassword(email);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-20">
      <p className="text-xs font-mono uppercase tracking-wide text-ink/40 mb-2">Account recovery</p>
      <h1 className="font-display text-3xl font-semibold mb-8">Reset your password</h1>

      {!result && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white"
              placeholder="you@organization.com"
            />
          </div>

          {error && <p className="text-sm text-claim bg-claim-light px-3 py-2 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="focus-ring w-full py-3 rounded-full bg-rescue text-white font-semibold hover:bg-rescue-dark transition-colors disabled:opacity-60"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      {result && (
        <div className="space-y-4">
          <p className="text-sm bg-rescue/10 text-rescue-dark px-4 py-3 rounded-xl">{result.message}</p>

          {result.demoMode && result.resetUrl && (
            <div className="text-sm bg-amber-light text-amber-dark px-4 py-3 rounded-xl space-y-2">
              <p className="font-semibold">Demo mode — email sending isn't set up yet</p>
              <p>{result.note}</p>
              <Link to={result.resetUrl.replace(window.location.origin, '')} className="block break-all font-mono text-xs underline">
                {result.resetUrl}
              </Link>
            </div>
          )}
        </div>
      )}

      <p className="text-sm text-ink/60 mt-6">
        Remembered your password? <Link to="/login" className="text-rescue font-medium hover:underline">Log in</Link>
      </p>
    </div>
  );
}
