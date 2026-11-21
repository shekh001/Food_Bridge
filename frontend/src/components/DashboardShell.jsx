import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutGrid, PackagePlus, Handshake, BarChart3, LogOut,
  Search, Bell, Leaf, Menu, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const NAV = {
  donor: [
    { to: '/donor', label: 'Dashboard', icon: LayoutGrid },
    { to: '/browse', label: 'Live feed', icon: PackagePlus },
    { to: '/needs', label: 'Needs board', icon: Handshake },
    { to: '/impact', label: 'Platform impact', icon: BarChart3 },
  ],
  ngo: [
    { to: '/ngo', label: 'Dashboard', icon: LayoutGrid },
    { to: '/browse', label: 'Live feed', icon: Handshake },
    { to: '/impact', label: 'Platform impact', icon: BarChart3 },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutGrid },
    { to: '/browse', label: 'Live feed', icon: PackagePlus },
  ],
};

/**
 * The dashboard-specific shell (dark sidebar, search+action topbar) used by
 * Donor/NGO/Admin — distinct from the marketing Navbar used on public pages,
 * because a data-dense workspace and a marketing header want different
 * chrome. `title`/`subtitle`/`action` fill the topbar; `children` is the
 * page content underneath.
 */
export default function DashboardShell({ title, subtitle, action, children, search, onSearchChange, searchPlaceholder = 'Search…' }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navItems = NAV[user?.role] || NAV.donor;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const sidebarContent = (
    <>
      <div className="px-6 py-6 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-rescue flex items-center justify-center shrink-0">
            <Leaf size={16} className="text-white" strokeWidth={2.5} />
          </span>
          <span className="font-display text-lg font-semibold">FoodBridge</span>
        </div>
        <button onClick={() => setMobileNavOpen(false)} className="focus-ring text-paper/50 md:hidden" aria-label="Close menu">
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 px-3 mt-4 space-y-1">
        {navItems.map((item) => {
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileNavOpen(false)}
              className={`focus-ring flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active ? 'bg-rescue text-white' : 'text-paper/60 hover:text-paper hover:bg-white/5'
              }`}
            >
              <item.icon size={17} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-5 space-y-1 border-t border-white/10 pt-4 mx-3">
        <button onClick={logout}
          className="focus-ring w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-paper/50 hover:text-paper hover:bg-white/5 transition-colors">
          <LogOut size={17} strokeWidth={2} />
          Log out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-paper font-body">
      {/* Desktop: a normal in-flow sidebar. Mobile: the same content becomes
          a slide-in overlay drawer (fixed position, off-canvas by default) —
          without this split, a phone user would have no navigation and no
          way to log out at all, since the sidebar was the only nav chrome. */}
      <aside className="w-60 shrink-0 bg-ink text-paper flex-col hidden md:flex">
        {sidebarContent}
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute top-0 left-0 bottom-0 w-64 bg-ink text-paper flex flex-col shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-line px-6 md:px-8 py-4 flex items-center gap-4 flex-wrap">
          <button onClick={() => setMobileNavOpen(true)} className="focus-ring text-ink/60 md:hidden shrink-0" aria-label="Open menu">
            <Menu size={22} />
          </button>
          {/* Only rendered when a page actually wires it up (passes
              onSearchChange) — a search box that looks clickable but does
              nothing on pages that don't need one is worse than no box at all. */}
          {onSearchChange && (
            <div className="relative flex-1 min-w-[180px] max-w-sm hidden sm:block">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
              <input
                value={search || ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="focus-ring w-full pl-9 pr-4 py-2 rounded-full border border-line bg-paper text-sm placeholder:text-ink/35"
              />
            </div>
          )}
          <div className="flex-1" />
          {action}
          <button className="focus-ring w-9 h-9 rounded-full border border-line flex items-center justify-center text-ink/50 hover:text-ink shrink-0" aria-label="Notifications">
            <Bell size={16} />
          </button>
          <div className="w-9 h-9 rounded-full bg-rescue-light text-rescue-dark flex items-center justify-center font-semibold text-sm shrink-0">
            {(user?.orgName || user?.name || '?').charAt(0).toUpperCase()}
          </div>
        </header>

        <main className="flex-1 px-6 md:px-8 py-8 max-w-6xl w-full mx-auto">
          {(title || subtitle) && (
            <div className="mb-8">
              {title && <h1 className="font-display text-2xl md:text-3xl font-semibold">{title}</h1>}
              {subtitle && <p className="text-sm text-ink/50 mt-1">{subtitle}</p>}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
