import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AppealForm from '../components/AppealForm.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(
    searchParams.get('suspended')
      ? decodeURIComponent(searchParams.get('msg') || 'Your account has been suspended.')
      : searchParams.get('expired')
        ? 'Your session expired — please log in again.'
        : ''
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      const path = user.role === 'donor' ? '/donor' : user.role === 'ngo' ? '/ngo' : '/admin';
      navigate(path);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-20">
      <p className="text-xs font-mono uppercase tracking-wide text-ink/40 mb-2">Welcome back</p>
      <h1 className="font-display text-3xl font-semibold mb-8">Log in to FoodBridge</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white"
            placeholder="you@organization.com"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium">Password</label>
            <Link to="/forgot-password" className="text-xs text-rescue font-medium hover:underline">
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-sm text-claim bg-claim-light px-3 py-2 rounded-lg">{error}</p>}
        {searchParams.get('suspended') && <AppealForm prefillEmail={form.email} />}

        <button
          type="submit"
          disabled={loading}
          className="focus-ring w-full py-3 rounded-full bg-rescue text-white font-semibold hover:bg-rescue-dark transition-colors disabled:opacity-60"
        >
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="text-sm text-ink/60 mt-6">
        New to FoodBridge? <Link to="/register" className="text-rescue font-medium hover:underline">Create an account</Link>
      </p>

      <div className="mt-10 pt-6 border-t border-line text-xs text-ink/40 font-mono leading-relaxed">
        Demo logins (password: password123) —<br />
        donor1@foodbridge.app · ngo1@foodbridge.app · admin@foodbridge.app
      </div>
    </div>
  );
}
