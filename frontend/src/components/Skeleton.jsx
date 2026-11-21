/** Pulsing placeholder shapes shown while data is loading, so a page shows
 * "something is coming" instead of a blank gap or a jarring flash of an
 * empty state before the real fetch resolves. */

/** Mimics a ListingCard's shape — used on Browse and the NGO dashboard's
 * matched-listings grid while the initial fetch is in flight. */
export function ListingCardSkeleton({ count = 3 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-line shadow-card p-5 animate-pulse">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="h-5 w-3/4 bg-line/60 rounded-md" />
              <div className="h-3.5 w-1/2 bg-line/40 rounded-md mt-2" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-3.5 w-12 bg-line/40 rounded-md" />
            <div className="h-3.5 w-16 bg-line/40 rounded-md" />
            <div className="h-3.5 w-14 bg-line/40 rounded-md" />
          </div>
          <div className="mt-4 pt-4 border-t border-line">
            <div className="h-2 w-full bg-line/40 rounded-full" />
          </div>
        </div>
      ))}
    </>
  );
}

/** Mimics a listing row on the donor/NGO dashboards' "your listings" /
 * "your claims" lists. */
export function ListingRowSkeleton({ count = 3 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-line rounded-2xl p-5 flex items-center gap-4 animate-pulse">
          <div className="w-12 h-12 rounded-xl bg-line/50 shrink-0" />
          <div className="flex-1 min-w-[160px]">
            <div className="h-4 w-2/3 bg-line/60 rounded-md" />
            <div className="h-3 w-1/3 bg-line/40 rounded-md mt-2" />
          </div>
          <div className="h-2 w-24 bg-line/40 rounded-full hidden sm:block" />
        </div>
      ))}
    </>
  );
}
