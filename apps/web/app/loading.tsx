export default function Loading() {
  return (
    <div className="w-full">
      {/* Hero skeleton */}
      <div className="flex flex-col md:flex-row items-center gap-8 mb-16 stagger-fade-in" style={{ "--stagger-index": 0 } as React.CSSProperties}>
        <div className="flex-1">
          <div className="h-12 w-48 skeleton-shimmer rounded mb-6" />
          <div className="h-5 w-full skeleton-shimmer rounded mb-3" />
          <div className="h-5 w-2/3 skeleton-shimmer rounded mb-6" />
          <div className="flex gap-3">
            <div className="h-10 w-36 skeleton-shimmer rounded" />
            <div className="h-10 w-36 skeleton-shimmer rounded" />
          </div>
        </div>
        <div className="w-[220px] h-[220px] skeleton-shimmer rounded-2xl flex-shrink-0" />
      </div>

      {/* Recent writings skeleton */}
      <div className="h-7 w-40 skeleton-shimmer rounded mb-6" />
      <div className="flex flex-col gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4 p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg stagger-fade-in" style={{ "--stagger-index": i } as React.CSSProperties}>
            <div className="w-28 h-28 skeleton-shimmer rounded-lg flex-shrink-0" />
            <div className="flex-1 flex flex-col justify-between py-1">
              <div className="h-5 w-3/4 skeleton-shimmer rounded" />
              <div className="h-3 w-24 skeleton-shimmer rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
