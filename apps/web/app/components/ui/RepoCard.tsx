import { StarFill, Diagram2 } from "react-bootstrap-icons";
import { fetchProjectStats } from "../../lib/projects";
import { projects, type ApiProjectStats } from "../../projects/project-data";

interface RepoCardProps {
  repo: string;
}

function findRepoStats(
  statsMap: Map<string, ApiProjectStats>,
  repo: string,
): { stats: ApiProjectStats; key: string } | null {
  const repoLower = repo.toLowerCase();
  const entries = Array.from(statsMap.entries());
  for (const [key, value] of entries) {
    if (key.split("/")[1] === repoLower) {
      return { stats: value, key };
    }
  }
  return null;
}

export async function RepoCard({ repo }: RepoCardProps) {
  const statsMap = await fetchProjectStats();

  const match = statsMap ? findRepoStats(statsMap, repo) : null;
  const stats = match?.stats ?? null;
  const fullRepoKey = match?.key ?? null;

  const staticProject = projects.find((p) =>
    p.url.toLowerCase().includes(`/${repo.toLowerCase()}`)
  );

  const repoUrl = fullRepoKey
    ? `https://github.com/${fullRepoKey}`
    : staticProject?.url ?? `https://github.com/nxank4/${repo}`;
  const description = staticProject?.description ?? null;

  return (
    <a
      href={repoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="not-prose my-6 block rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-4 no-underline transition-colors hover:border-neutral-300 dark:hover:border-neutral-600"
    >
      <div className="flex items-center gap-2 mb-2">
        <svg
          viewBox="0 0 16 16"
          className="w-4 h-4 text-neutral-500 dark:text-neutral-400"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
        </svg>
        <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
          {repo}
        </span>
      </div>

      {description && (
        <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-3 line-clamp-2">
          {description}
        </p>
      )}

      {stats && (
        <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          {stats.language && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />
              {stats.language}
            </span>
          )}
          <span className="flex items-center gap-1">
            <StarFill size={12} />
            {stats.stars}
          </span>
          {stats.forks > 0 && (
            <span className="flex items-center gap-1">
              <Diagram2 size={12} />
              {stats.forks}
            </span>
          )}
        </div>
      )}
    </a>
  );
}
