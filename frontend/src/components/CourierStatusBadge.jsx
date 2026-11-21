/** Renders once a courier has been booked for a listing. `booking` is the
 * shape returned by GET /api/couriers/:listingId or the create/confirm
 * responses: { _id, courierName, courierPhone, etaMinutes, pickupAddress,
 * dropoffAddress, status }. Pass `onCancel` only from the NGO side (the
 * party that actually owns the booking) — the donor's read-only view omits
 * it and gets no cancel button. */
export default function CourierStatusBadge({ booking, onCancel }) {
  if (!booking) return null;
  const pickedUp = booking.status === 'picked_up';

  return (
    <div className={`mt-3 rounded-xl p-3 flex gap-3 border ${
      pickedUp ? 'bg-rescue-light border-rescue/20' : 'bg-amber-light/40 border-amber/30'
    }`}>
      <span className="text-lg shrink-0">🛵</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink truncate">
              {pickedUp ? `Picked up by ${booking.courierName}` : `${booking.courierName} is on the way`}
            </p>
            <p className="text-[11px] text-ink/50 mt-0.5">
              {pickedUp ? booking.courierPhone : `${booking.courierPhone} · ETA ~${booking.etaMinutes} min`}
            </p>
          </div>
          {onCancel && !pickedUp && (
            <button onClick={() => onCancel(booking)}
              className="focus-ring shrink-0 text-[11px] font-medium text-claim hover:underline">
              Cancel
            </button>
          )}
        </div>
        {(booking.pickupAddress || booking.dropoffAddress) && (
          <div className="mt-2 pt-2 border-t border-ink/[0.06] space-y-1">
            {booking.pickupAddress && (
              <p className="text-[11px] text-ink/60 flex gap-1.5">
                <span className="shrink-0 font-mono text-[10px] text-ink/35 mt-[1px]">FROM</span>
                <span className="truncate">{booking.pickupAddress}</span>
              </p>
            )}
            {booking.dropoffAddress && (
              <p className="text-[11px] text-ink/60 flex gap-1.5">
                <span className="shrink-0 font-mono text-[10px] text-ink/35 mt-[1px]">TO</span>
                <span className="truncate">{booking.dropoffAddress}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
