export default function Loading() {
  return (
    <article className="w-full">
      {/* Back link */}
      <div className="h-4 w-24 skeleton-shimmer rounded mb-8 stagger-fade-in" style={{ "--stagger-index": 0 } as React.CSSProperties} />

      {/* Title */}
      <div className="h-10 w-3/4 skeleton-shimmer rounded mb-4 stagger-fade-in" style={{ "--stagger-index": 1 } as React.CSSProperties} />

      {/* Date + reading time */}
      <div className="flex gap-4 mb-8 stagger-fade-in" style={{ "--stagger-index": 2 } as React.CSSProperties}>
        <div className="h-4 w-28 skeleton-shimmer rounded" />
        <div className="h-4 w-20 skeleton-shimmer rounded" />
      </div>

      {/* Article body lines */}
      <div className="space-y-3">
        {[100, 95, 80, 100, 60, 90, 100, 75, 85, 50].map((w, i) => (
          <div
            key={i}
            className="h-4 skeleton-shimmer rounded stagger-fade-in"
            style={{ width: `${w}%`, "--stagger-index": i + 3 } as React.CSSProperties}
          />
        ))}
      </div>
    </article>
  );
}
