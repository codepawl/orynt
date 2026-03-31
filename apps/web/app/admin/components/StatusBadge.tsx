const STATUS_BADGE: Record<string, string> = {
  draft: "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
  review: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400",
  published: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400",
  rejected: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400",
  archived: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
        STATUS_BADGE[status] ?? STATUS_BADGE.draft
      }`}
    >
      {status}
    </span>
  );
}
