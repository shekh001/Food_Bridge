import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function VerifyEmail() {
  const { token } = useParams();
  const { verifyEmail } = useAuth();
  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.message || 'This verification link is invalid or has expired.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="max-w-md mx-auto px-6 py-24 text-center">
      {status === 'verifying' && (
        <>
          <div className="w-8 h-8 border-2 border-line border-t-rescue rounded-full animate-spin mx-auto mb-6" />
          <p className="text-ink/50">Verifying your email…</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="w-14 h-14 rounded-full bg-rescue-light flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl">✓</span>
          </div>
          <h1 className="font-display text-2xl font-semibold mb-3">Email verified</h1>
          <p className="text-ink/60 mb-8">You're all set — you can now post surplus food listings.</p>
          <Link to="/donor" className="focus-ring inline-block px-6 py-2.5 rounded-full bg-rescue text-white font-semibold hover:bg-rescue-dark">
            Go to your dashboard
          </Link>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="w-14 h-14 rounded-full bg-claim-light flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl">!</span>
          </div>
          <h1 className="font-display text-2xl font-semibold mb-3">Link didn't work</h1>
          <p className="text-ink/60 mb-8">{message}</p>
          <Link to="/donor" className="focus-ring inline-block px-6 py-2.5 rounded-full border border-line font-semibold hover:border-ink/30">
            Go to your dashboard to resend it
          </Link>
        </>
      )}
    </div>
  );
}
