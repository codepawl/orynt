import type {
  Project,
  ApiProjectStats,
  EnrichedProject,
} from "app/projects/project-data";

interface ApiProjectInfo {
  repo: string;
  owner: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  latest_release: string | null;
  latest_release_date: string | null;
  last_commit_date: string | null;
  last_commit_message: string | null;
  updated_at: string;
}

/**
 * Fetch project stats from the backend API with ISR caching and timeout.
 * Returns null on any failure (missing env, network error, timeout, bad response).
 */
export async function fetchProjectStats(): Promise<Map<
  string,
  ApiProjectStats
> | null> {
  const apiUrl = process.env.BACKEND_API_URL;
  if (!apiUrl) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${apiUrl}/projects`, {
      next: { revalidate: 3600 },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const data: ApiProjectInfo[] = await res.json();

    const statsMap = new Map<string, ApiProjectStats>();
    for (const item of data) {
      const key = `${item.owner}/${item.repo}`.toLowerCase();
      statsMap.set(key, {
        stars: item.stars,
        forks: item.forks,
        language: item.language,
        lastCommitDate: item.last_commit_date,
        lastCommitMessage: item.last_commit_message,
        latestRelease: item.latest_release,
        latestReleaseDate: item.latest_release_date,
        openIssues: item.open_issues,
      });
    }

    return statsMap;
  } catch {
    return null;
  }
}

function extractOwnerRepo(githubUrl: string): string | null {
  try {
    const url = new URL(githubUrl);
    if (!url.hostname.includes("github.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`.toLowerCase();
    return null;
  } catch {
    return null;
  }
}

/**
 * Merge static project data with live API stats.
 * Static data is the source of truth — API enriches but never replaces curated content.
 */
export function mergeProjectData(
  staticProjects: Project[],
  statsMap: Map<string, ApiProjectStats> | null,
): EnrichedProject[] {
  return staticProjects.map((project) => {
    const key = extractOwnerRepo(project.url);
    const stats = key ? statsMap?.get(key) ?? undefined : undefined;

    return {
      ...project,
      stats,
      isLive: statsMap !== null && statsMap.size > 0 && stats !== undefined,
    };
  });
}


// ── Org repos ─────────────────────────────────────────────────────

export interface OrgRepo {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  license: string | null;
  topics: string[];
  homepage: string | null;
  created_at: string | null;
  updated_at: string | null;
  default_branch: string;
}

export async function fetchOrgRepos(): Promise<OrgRepo[]> {
  const apiUrl = process.env.BACKEND_API_URL;
  if (!apiUrl) return [];
  try {
    const res = await fetch(`${apiUrl}/projects/org`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}


// ── README ────────────────────────────────────────────────────────

export interface ReadmeData {
  full_markdown: string;
  sections: Record<string, string>;
  badges: string[];
  package_url: string | null;
  docs_url: string | null;
}

export async function fetchReadme(owner: string, repo: string): Promise<ReadmeData | null> {
  const apiUrl = process.env.BACKEND_API_URL;
  if (!apiUrl) return null;
  try {
    const res = await fetch(`${apiUrl}/projects/${owner}/${repo}/readme`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
