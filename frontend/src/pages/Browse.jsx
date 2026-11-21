import { useEffect, useState, useMemo } from 'react';
import client from '../api/client.js';
import ListingCard from '../components/ListingCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { ListingCardSkeleton } from '../components/Skeleton.jsx';
import RescueMark from '../components/RescueMark.jsx';
import { SlidersHorizontal } from 'lucide-react';

export default function Browse() {
  const { user } = useAuth();
  const { notifications } = useSocket();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [justRemovedId, setJustRemovedId] = useState(null);
  const [foodTypeFilter, setFoodTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  function load() {
    client.get('/listings', { params: { status: 'posted' } })
      .then(({ data }) => setListings(data.listings))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  // Keep the public feed live: a new posting shows up for everyone
  // browsing right now, and a listing someone else just claimed disappears
  // instead of sitting there as a dead end that ends in a 409 on click.
  useEffect(() => {
    const latest = notifications[0];
    if (!latest) return;
    if (latest.kind === 'removed' && latest.payload?.listingId) {
      setListings((prev) => prev.filter((l) => l._id !== latest.payload.listingId));
      setJustRemovedId(latest.payload.listingId);
      setTimeout(() => setJustRemovedId((id) => (id === latest.payload.listingId ? null : id)), 4000);
    } else if (latest.kind === 'new_listing' && latest.payload?._id) {
      setListings((prev) => (prev.some((l) => l._id === latest.payload._id) ? prev : [latest.payload, ...prev]));
    }
  }, [notifications]);

  const foodTypes = useMemo(
    () => Array.from(new Set(listings.map((l) => l.foodType))).sort(),
    [listings]
  );

  const visibleListings = useMemo(() => {
    let list = foodTypeFilter === 'all' ? listings : listings.filter((l) => l.foodType === foodTypeFilter);
    list = [...list].sort((a, b) => {
      if (sortBy === 'expiring') return new Date(a.expiryAt) - new Date(b.expiryAt);
      if (sortBy === 'match' && user?.role === 'ngo') return (b.myMatchScore || 0) - (a.myMatchScore || 0);
      return new Date(b.createdAt) - new Date(a.createdAt); // newest
    });
    return list;
  }, [listings, foodTypeFilter, sortBy, user?.role]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-14">
      <p className="text-xs font-mono uppercase tracking-wide text-ink/40 mb-2">Right now</p>
      <h1 className="font-display text-3xl md:text-4xl font-semibold mb-2">Live surplus feed</h1>
      <p className="text-ink/60 max-w-lg mb-8">
        Every open listing, ranked freshest-first. NGOs see a personalized match score once logged in.
      </p>

      {listings.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-8 text-sm">
          <span className="inline-flex items-center gap-1.5 text-ink/40">
            <SlidersHorizontal size={14} />Filter
          </span>
          <select value={foodTypeFilter} onChange={(e) => setFoodTypeFilter(e.target.value)}
            className="focus-ring px-3 py-1.5 rounded-full border border-line bg-white text-ink/70">
            <option value="all">All food types</option>
            {foodTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="w-px h-4 bg-line" />
          <button onClick={() => setSortBy('newest')}
            className={`px-3 py-1.5 rounded-full border transition-colors ${sortBy === 'newest' ? 'bg-ink text-white border-ink' : 'border-line text-ink/60 hover:border-ink/30'}`}>
            Newest
          </button>
          <button onClick={() => setSortBy('expiring')}
            className={`px-3 py-1.5 rounded-full border transition-colors ${sortBy === 'expiring' ? 'bg-ink text-white border-ink' : 'border-line text-ink/60 hover:border-ink/30'}`}>
            Expiring soonest
          </button>
          {user?.role === 'ngo' && (
            <button onClick={() => setSortBy('match')}
              className={`px-3 py-1.5 rounded-full border transition-colors ${sortBy === 'match' ? 'bg-ink text-white border-ink' : 'border-line text-ink/60 hover:border-ink/30'}`}>
              Best match
            </button>
          )}
        </div>
      )}

      {justRemovedId && (
        <div className="mb-6 text-sm text-amber-dark bg-amber-light px-4 py-2.5 rounded-xl">
          A listing was just claimed by another NGO and removed from this list.
        </div>
      )}

      {!loading && listings.length === 0 && (
        <div className="border border-dashed border-line rounded-2xl p-12 text-center">
          <RescueMark size={72} className="mx-auto mb-4" />
          <p className="text-ink/50">Nothing posted right now — check back soon, or list your own surplus food.</p>
        </div>
      )}

      {!loading && listings.length > 0 && visibleListings.length === 0 && (
        <div className="border border-dashed border-line rounded-2xl p-12 text-center text-ink/50">
          No {foodTypeFilter} listings posted right now.
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading && <ListingCardSkeleton count={6} />}
        {!loading && visibleListings.map((listing) => (
          <ListingCard key={listing._id} listing={listing} showMatch={user?.role === 'ngo'} />
        ))}
      </div>
    </div>
  );
}
