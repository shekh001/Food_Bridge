import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { enablePushNotifications, disablePushNotifications, isPushEnabled, pushSupported } from '../utils/push.js';

const ROLE_BADGE = {
  donor: { label: 'Donor', bg: '#E6F0EA', fg: '#2F6F4E' },
  ngo: { label: 'NGO / Recipient', bg: '#FCEBCB', fg: '#C9840F' },
  admin: { label: 'Admin', bg: '#FBE4E4', fg: '#D64545' },
};

function RoleBadge({ role }) {
  const b = ROLE_BADGE[role];
  if (!b) return null;
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
      style={{ backgroundColor: b.bg, color: b.fg }}
    >
      {b.label}
    </span>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pushOn, setPushOn] = useState(false);

  const dashboardPath = user?.role === 'donor' ? '/donor' : user?.role === 'ngo' ? '/ngo' : user?.role === 'admin' ? '/admin' : '/';

  useEffect(() => {
    if (user && pushSupported()) isPushEnabled().then(setPushOn);
  }, [user]);

  async function togglePush() {
    try {
      if (pushOn) { await disablePushNotifications(); setPushOn(false); }
      else { await enablePushNotifications(); setPushOn(true); }
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="w-2.5 h-2.5 rounded-full bg-rescue group-hover:bg-amber transition-colors" />
          <span className="font-display font-semibold text-lg tracking-tight">FoodBridge</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-ink/70">
          <Link to="/browse" className="hover:text-ink transition-colors">Live feed</Link>
          <Link to="/needs" className="hover:text-ink transition-colors">Needs board</Link>
          <Link to="/impact" className="hover:text-ink transition-colors">Impact</Link>
          {user && <Link to={dashboardPath} className="hover:text-ink transition-colors">Dashboard</Link>}
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              {pushSupported() && (
                <button
                  onClick={togglePush}
                  title={pushOn ? 'Notifications on — click to disable' : 'Enable push notifications'}
                  className="focus-ring w-9 h-9 flex items-center justify-center rounded-full border border-line hover:border-ink/30 transition-colors text-base"
                >
                  {pushOn ? '🔔' : '🔕'}
                </button>
              )}
              <span className="flex items-center gap-2">
                <RoleBadge role={user.role} />
                <span className="hidden sm:inline text-xs font-mono text-ink/50">{user.orgName}</span>
              </span>
              <button
                onClick={() => { logout(); navigate('/'); }}
                className="focus-ring text-sm font-medium px-3.5 py-1.5 rounded-full border border-line hover:border-ink/30 transition-colors"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="focus-ring text-sm font-medium px-3.5 py-1.5 rounded-full hover:bg-ink/5 transition-colors">
                Log in
              </Link>
              <Link
                to="/register"
                className="focus-ring text-sm font-semibold px-4 py-1.5 rounded-full bg-rescue text-white hover:bg-rescue-dark transition-colors"
              >
                Join FoodBridge
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
