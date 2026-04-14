import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { StarFill, Diagram2, BoxArrowUpRight, ArrowLeft } from "react-bootstrap-icons";
import { metaData } from "app/config";
import { getProjectBySlug } from "../project-data";
import type { Project, ApiProjectStats } from "../project-data";
import { fetchProjectStats, fetchOrgRepos, fetchReadme } from "app/lib/projects";
import { fetchPosts } from "app/lib/community";
import { fetchBlogPosts } from "app/lib/blog";
import { fetchWikiPages } from "app/lib/wiki";
import { fetchDocTree } from "app/lib/github-docs";
import { ProjectHubTabs } from "./ProjectHubTabs";

interface Props {
  params: Promise<{ slug: string }>;
}

/** Resolve a project by slug — try static data first, then org repos. */
async function resolveProject(slug: string): Promise<{
  project: Project;
  owner: string;
  repo: string;
} | null> {
  // Try static data first
  const staticProject = getProjectBySlug(slug);
  if (staticProject) {
    const parsed = extractOwnerRepo(staticProject.url);
    return {
      project: staticProject,
      owner: parsed?.owner ?? "codepawl",
      repo: parsed?.repo ?? slug,
    };
  }

  // Try org repos (for dynamically discovered repos)
  const orgRepos = await fetchOrgRepos();
  const orgRepo = orgRepos.find((r) => r.name === slug);
  if (orgRepo) {
    return {
      project: {
        title: orgRepo.name,
        year: orgRepo.created_at ? new Date(orgRepo.created_at).getFullYear() : new Date().getFullYear(),
        description: orgRepo.description || `${orgRepo.name} — a CodePawl project`,
        url: `https://github.com/${orgRepo.full_name}`,
        slug: orgRepo.name,
        quickStart: { install: "", example: "" },
        docsUrl: orgRepo.homepage || null,
        packageUrl: null,
      },
      owner: "codepawl",
      repo: orgRepo.name,
    };
  }

  return null;
}

function extractOwnerRepo(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
  } catch { /* ignore */ }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveProject(slug);
  if (!resolved) return {};

  return {
    title: `${resolved.project.title} | Projects`,
    description: resolved.project.description,
    alternates: { canonical: `${metaData.baseUrl}projects/${slug}` },
    openGraph: {
      title: `${resolved.project.title} | CodePawl Projects`,
      description: resolved.project.description,
      url: `${metaData.baseUrl}projects/${slug}`,
      siteName: metaData.name,
      locale: "en_US",
      type: "website",
    },
  };
}

export default async function ProjectHubPage({ params }: Props) {
  const { slug } = await params;
  const resolved = await resolveProject(slug);
  if (!resolved) notFound();

  const { project, owner, repo } = resolved;

  // Fetch live stats, community posts, blog posts, README, wiki pages, and doc tree in parallel
  const repoFullName = `${owner}/${repo}`;
  const [statsMap, communityData, blogData, readme, wikiPages, docTree] = await Promise.all([
    fetchProjectStats(),
    fetchPosts(1, "new", undefined, slug).catch(() => null),
    fetchBlogPosts(1).catch(() => null),
    fetchReadme(owner, repo),
    fetchWikiPages(slug),
    fetchDocTree(repoFullName).catch(() => ({ files: [] })),
  ]);

  // Get stats from statsMap if available
  const statsKey = `${owner}/${repo}`.toLowerCase();
  const stats: ApiProjectStats | undefined = statsMap?.get(statsKey);
  const isLive = statsMap !== null && statsMap.size > 0 && stats !== undefined;

  const titleLower = project.title.toLowerCase();
  const slugLower = slug.toLowerCase();
  const relatedBlogPosts = (blogData?.posts ?? [])
    .filter((post) => {
      const tags = post.tags?.toLowerCase() ?? "";
      return tags.includes(titleLower) || tags.includes(slugLower);
    })
    .map((post) => ({
      slug: post.slug,
      title: post.title,
      date: post.published_at ?? post.created_at,
    }));

  const communityPosts = communityData?.posts?.slice(0, 10) ?? [];
  const sections = readme?.sections ?? {};

  // Determine package/docs URLs — prefer README-extracted, fallback to static data
  const packageUrl = readme?.package_url ?? project.packageUrl;
  const docsUrl = readme?.docs_url ?? project.docsUrl;

  return (
    <section className="max-w-3xl mx-auto w-full">
      {/* Back link */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 mb-6 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 no-underline transition-colors"
      >
        <ArrowLeft size={14} />
        Back to projects
      </Link>

      {/* Hero */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
          {project.title}
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          {project.description}
        </p>

        {/* Badges */}
        {stats && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
            {stats.language && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />
                {stats.language}
              </span>
            )}
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800">
              {isLive && (
                <span className="relative flex h-2 w-2" title="Live from GitHub">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 animate-ping opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
              )}
              <StarFill size={12} />
              {stats.stars}
            </span>
            {stats.forks > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800">
                <Diagram2 size={12} />
                {stats.forks}
              </span>
            )}
            {stats.latestRelease && (
              <span className="px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800">
                {stats.latestRelease}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Links row */}
      <div className="flex flex-wrap gap-3 mb-8">
        <a
          href={project.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors no-underline"
        >
          GitHub
          <BoxArrowUpRight size={12} />
        </a>
        {packageUrl && (
          <a
            href={packageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors no-underline"
          >
            {packageUrl.includes("pypi") ? "PyPI" : packageUrl.includes("npm") ? "npm" : "Package"}
            <BoxArrowUpRight size={12} />
          </a>
        )}
        {docsUrl && (
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors no-underline"
          >
            Full docs
            <BoxArrowUpRight size={12} />
          </a>
        )}
        {docTree.files.length > 0 && (
          <Link
            href={`/projects/${slug}/docs`}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors no-underline"
          >
            Docs
          </Link>
        )}
        <Link
          href={`/projects/${slug}/wiki`}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors no-underline"
        >
          Wiki{wikiPages.length > 0 ? ` (${wikiPages.length})` : ""}
        </Link>
      </div>

      {/* Tabbed content */}
      <ProjectHubTabs
        sections={sections}
        installCommand={project.quickStart.install}
        exampleCode={project.quickStart.example}
        communityPosts={communityPosts}
        relatedBlogPosts={relatedBlogPosts}
        slug={slug}
        repoOwner={owner}
        repoName={repo}
      />

      {/* JSON-LD structured data for search engines */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: project.title,
            description: project.description,
            url: `${metaData.baseUrl}projects/${slug}`,
            applicationCategory: "DeveloperApplication",
            operatingSystem: "Cross-platform",
            ...(stats && {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: Math.min(5, Math.max(1, Math.round((stats.stars / 100) * 5 * 10) / 10)),
                bestRating: 5,
                ratingCount: stats.stars,
              },
            }),
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }),
        }}
      />
    </section>
  );
}
