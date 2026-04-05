export default function Loading() {
  return (
    <div className="w-full">
      {/* Avatar + name row */}
      <div className="flex items-center gap-6 mb-8 stagger-fade-in" style={{ "--stagger-index": 0 } as React.CSSProperties}>
        <div className="flex-1">
          <div className="h-10 w-48 skeleton-shimmer rounded mb-4" />
          <div className="h-5 w-64 skeleton-shimmer rounded mb-4" />
          <div className="h-4 w-40 skeleton-shimmer rounded" />
        </div>
        <div className="w-[120px] h-[120px] rounded-full skeleton-shimmer flex-shrink-0" />
      </div>

      {/* Divider */}
      <div className="h-px w-full bg-neutral-200 dark:bg-neutral-800 mb-8" />

      {/* Section skeletons */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="mb-12 stagger-fade-in" style={{ "--stagger-index": i } as React.CSSProperties}>
          <div className="h-7 w-32 skeleton-shimmer rounded mb-6" />
          <div className="h-5 w-64 skeleton-shimmer rounded mb-3" />
          <div className="h-4 w-full skeleton-shimmer rounded mb-2" />
          <div className="h-4 w-3/4 skeleton-shimmer rounded mb-2" />
          <div className="h-4 w-5/6 skeleton-shimmer rounded" />
        </div>
      ))}
    </div>
  );
}
