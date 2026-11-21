import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const user = await resetPassword(token, password);
      navigate(user.role === 'donor' ? '/donor' : user.role === 'ngo' ? '/ngo' : '/admin');
    } catch (err) {
      setError(err.response?.data?.message || 'This reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-20">
      <p className="text-xs font-mono uppercase tracking-wide text-ink/40 mb-2">Account recovery</p>
      <h1 className="font-display text-3xl font-semibold mb-8">Choose a new password</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5">New password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white"
            placeholder="••••••••"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Confirm new password</label>
          <input
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-sm text-claim bg-claim-light px-3 py-2 rounded-lg">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="focus-ring w-full py-3 rounded-full bg-rescue text-white font-semibold hover:bg-rescue-dark transition-colors disabled:opacity-60"
        >
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>

      <p className="text-sm text-ink/60 mt-6">
        <Link to="/login" className="text-rescue font-medium hover:underline">Back to log in</Link>
      </p>
    </div>
  );
}
