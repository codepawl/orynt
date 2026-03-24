export default function Loading() {
  return (
    <article className="w-full animate-pulse">
      {/* Back link */}
      <div className="h-4 w-24 bg-neutral-100 dark:bg-neutral-800/60 rounded mb-8" />

      {/* Title */}
      <div className="h-10 w-3/4 bg-neutral-200 dark:bg-neutral-800 rounded mb-4" />

      {/* Date + reading time */}
      <div className="flex gap-4 mb-8">
        <div className="h-4 w-28 bg-neutral-100 dark:bg-neutral-800/60 rounded" />
        <div className="h-4 w-20 bg-neutral-100 dark:bg-neutral-800/60 rounded" />
      </div>

      {/* Article body lines */}
      <div className="space-y-3">
        {[100, 95, 80, 100, 60, 90, 100, 75, 85, 50].map((w, i) => (
          <div
            key={i}
            className="h-4 bg-neutral-100 dark:bg-neutral-800/60 rounded"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </article>
  );
}
