export default function Loading() {
  return (
    <div className="w-full animate-pulse">
      {/* Avatar + name row */}
      <div className="flex items-center gap-6 mb-8">
        <div className="flex-1">
          <div className="h-10 w-48 bg-neutral-200 dark:bg-neutral-800 rounded mb-4" />
          <div className="h-5 w-64 bg-neutral-100 dark:bg-neutral-800/60 rounded mb-4" />
          <div className="h-4 w-40 bg-neutral-100 dark:bg-neutral-800/60 rounded" />
        </div>
        <div className="w-[120px] h-[120px] rounded-full bg-neutral-200 dark:bg-neutral-800 flex-shrink-0" />
      </div>

      {/* Divider */}
      <div className="h-px w-full bg-neutral-200 dark:bg-neutral-800 mb-8" />

      {/* Section skeletons */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="mb-12">
          <div className="h-7 w-32 bg-neutral-200 dark:bg-neutral-800 rounded mb-6" />
          <div className="h-5 w-64 bg-neutral-100 dark:bg-neutral-800/60 rounded mb-3" />
          <div className="h-4 w-full bg-neutral-100 dark:bg-neutral-800/60 rounded mb-2" />
          <div className="h-4 w-3/4 bg-neutral-100 dark:bg-neutral-800/60 rounded mb-2" />
          <div className="h-4 w-5/6 bg-neutral-100 dark:bg-neutral-800/60 rounded" />
        </div>
      ))}
    </div>
  );
}
