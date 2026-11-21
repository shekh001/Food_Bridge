import { Link } from 'react-router-dom';
import { Scale, Users, Clock, UtensilsCrossed, Bike, Truck } from 'lucide-react';
import RescueRail from './RescueRail.jsx';
import AuthImage from './AuthImage.jsx';

function timeLeft(expiryAt) {
  const ms = new Date(expiryAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const hrs = Math.floor(ms / 36e5);
  const mins = Math.floor((ms % 36e5) / 60000);
  if (hrs >= 1) return `${hrs}h ${mins}m left`;
  return `${mins}m left`;
}

export default function ListingCard({ listing, showMatch = false }) {
  const urgent = new Date(listing.expiryAt).getTime() - Date.now() < 3 * 3600 * 1000;
  // A short hop reads as a bike pickup, a longer haul as a truck run — a
  // small nod to how the actual pickup will look, not just an abstract km figure.
  const VehicleIcon = listing.myDistanceKm != null && listing.myDistanceKm >= 4 ? Truck : Bike;

  return (
    <Link
      to={`/listings/${listing._id}`}
      className="focus-ring group block bg-white rounded-2xl border border-line shadow-card overflow-hidden hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200"
    >
      {/* Always a visual header — a real photo when there is one, otherwise
          a food-type icon medallion on a tinted field, so a card never
          opens with a bare white top the way a plain list row would. */}
      <div className="h-32 relative overflow-hidden bg-rescue-light">
        {listing.photo ? (
          <AuthImage
            src={`/listings/${listing._id}/photo/${encodeURIComponent(listing.photo)}`}
            alt={listing.foodType}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UtensilsCrossed size={28} className="text-rescue-dark/40" strokeWidth={1.5} />
          </div>
        )}
        {urgent && listing.status === 'posted' && (
          <span className="absolute top-2.5 right-2.5 text-[10px] font-mono font-semibold uppercase tracking-wide bg-claim text-white px-2 py-1 rounded-full shadow-sm">
            Urgent
          </span>
        )}
        {showMatch && listing.myDistanceKm != null && (
          <span className="absolute bottom-2.5 left-2.5 text-[11px] font-mono font-semibold text-transit-dark bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full shadow-sm inline-flex items-center gap-1">
            <VehicleIcon size={12} />{listing.myDistanceKm}km
          </span>
        )}
      </div>

      <div className="p-5">
        <p className="font-display text-lg font-semibold text-ink leading-snug">{listing.foodType}</p>
        <p className="text-sm text-ink/60 mt-0.5 flex items-center gap-1.5">
          {listing.donor?.orgName}
          {listing.donor?.orgType === 'individual' && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-ink/10 text-ink/50">Individual</span>
          )}
        </p>

        <div className="mt-3.5 flex items-center gap-3 text-xs text-ink/60">
          <span className="inline-flex items-center gap-1 font-mono"><Scale size={13} />{listing.quantityKg}kg</span>
          <span className="inline-flex items-center gap-1 font-mono"><Users size={13} />~{listing.servingsEstimate || Math.round(listing.quantityKg * 2.5)}</span>
          <span className={`inline-flex items-center gap-1 font-mono ${urgent ? 'text-claim' : ''}`}>
            <Clock size={13} />{timeLeft(listing.expiryAt)}
          </span>
        </div>

        {showMatch && listing.myMatchScore !== undefined && (
          <div className="mt-3.5 flex items-center gap-2 text-xs">
            <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
              <div className="h-full bg-rescue rounded-full transition-all" style={{ width: `${Math.min(listing.myMatchScore, 100)}%` }} />
            </div>
            <span className="font-mono text-rescue-dark font-semibold shrink-0">{Math.round(listing.myMatchScore)}% match</span>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-line">
          <RescueRail status={listing.status} compact />
        </div>
      </div>
    </Link>
  );
}
