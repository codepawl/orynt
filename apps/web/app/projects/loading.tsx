export default function Loading() {
  return (
    <div className="w-full">
      {/* Header */}
      <div className="h-8 w-36 skeleton-shimmer rounded mb-8" />

      {/* Card grid skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-4 p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg stagger-fade-in" style={{ "--stagger-index": i } as React.CSSProperties}>
            <div className="w-32 h-32 skeleton-shimmer rounded-lg flex-shrink-0" />
            <div className="flex-1 flex flex-col justify-between py-1">
              <div>
                <div className="h-5 w-2/3 skeleton-shimmer rounded mb-3" />
                <div className="h-4 w-full skeleton-shimmer rounded mb-2" />
                <div className="h-4 w-1/2 skeleton-shimmer rounded" />
              </div>
              <div className="h-3 w-16 skeleton-shimmer rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
