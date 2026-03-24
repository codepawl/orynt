export default function Loading() {
  return (
    <div className="w-full animate-pulse">
      {/* Header */}
      <div className="h-8 w-32 bg-neutral-200 dark:bg-neutral-800 rounded mb-8" />

      {/* Card skeletons */}
      <div className="flex flex-col gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4 p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg">
            <div className="w-32 h-32 bg-neutral-200 dark:bg-neutral-800 rounded-lg flex-shrink-0" />
            <div className="flex-1 flex flex-col justify-between py-1">
              <div>
                <div className="h-5 w-3/4 bg-neutral-200 dark:bg-neutral-800 rounded mb-3" />
                <div className="h-4 w-full bg-neutral-100 dark:bg-neutral-800/60 rounded mb-2" />
                <div className="h-4 w-2/3 bg-neutral-100 dark:bg-neutral-800/60 rounded" />
              </div>
              <div className="h-3 w-24 bg-neutral-100 dark:bg-neutral-800/60 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
