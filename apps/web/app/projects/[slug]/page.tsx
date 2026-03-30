import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { StarFill, Diagram2, BoxArrowUpRight } from "react-bootstrap-icons";
import { metaData } from "app/config";
import {
  getProjectBySlug,
  getProjectSlugs,
} from "../project-data";
import { fetchProjectStats, mergeProjectData } from "app/lib/projects";
import { fetchPosts } from "app/lib/community";
import { getBlogPostsMetadata } from "app/lib/posts";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getProjectSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) return {};

  return {
    title: `${project.title} | Projects`,
    description: project.description,
    alternates: { canonical: `${metaData.baseUrl}projects/${slug}` },
    openGraph: {
      title: `${project.title} | CodePawl Projects`,
      description: project.description,
      url: `${metaData.baseUrl}projects/${slug}`,
      siteName: metaData.name,
      locale: "en_US",
      type: "website",
    },
  };
}

export default async function ProjectHubPage({ params }: Props) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) notFound();

  // Fetch live stats, community posts, and blog posts in parallel
  const [statsMap, communityData, blogPosts] = await Promise.all([
    fetchProjectStats(),
    fetchPosts(1, "new", undefined, slug).catch(() => null),
    Promise.resolve(getBlogPostsMetadata()),
  ]);

  const enriched = mergeProjectData([project], statsMap);
  const stats = enriched[0]?.stats;
  const isLive = enriched[0]?.isLive ?? false;

  // Filter blog posts by tag matching project title (case-insensitive)
  const titleLower = project.title.toLowerCase();
  const slugLower = slug.toLowerCase();
  const relatedBlogPosts = blogPosts.filter((post) => {
    const tags = post.metadata.tags?.toLowerCase() ?? "";
    return tags.includes(titleLower) || tags.includes(slugLower);
  });

  const communityPosts = communityData?.posts?.slice(0, 5) ?? [];

  return (
    <section className="max-w-3xl mx-auto w-full">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        <Link
          href="/projects"
          className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline"
        >
          Projects
        </Link>
        <span className="mx-2">/</span>
        <span className="text-neutral-900 dark:text-neutral-100">
          {project.title}
        </span>
      </nav>

      {/* Header */}
      <div className="mb-8">
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
          GitHub repo
          <BoxArrowUpRight size={12} />
        </a>
        {project.docsUrl && (
          <a
            href={project.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors no-underline"
          >
            Full docs
            <BoxArrowUpRight size={12} />
          </a>
        )}
        {project.packageUrl && (
          <a
            href={project.packageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors no-underline"
          >
            {project.packageUrl.includes("pypi") ? "PyPI" : "npm"}
            <BoxArrowUpRight size={12} />
          </a>
        )}
      </div>

      {/* Quick start */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Quick start
        </h2>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
              Install
            </p>
            <pre className="bg-neutral-900 dark:bg-neutral-800 rounded-lg p-4 overflow-x-auto">
              <code className="text-sm font-mono text-neutral-100">
                {project.quickStart.install}
              </code>
            </pre>
          </div>
          <div>
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
              Example
            </p>
            <pre className="bg-neutral-900 dark:bg-neutral-800 rounded-lg p-4 overflow-x-auto">
              <code className="text-sm font-mono text-neutral-100">
                {project.quickStart.example}
              </code>
            </pre>
          </div>
        </div>
      </div>

      {/* Community discussions */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Community discussions
        </h2>
        {communityPosts.length > 0 ? (
          <>
            <ul className="space-y-2">
              {communityPosts.map((post) => (
                <li key={post.id}>
                  <Link
                    href={`/community/post/${post.id}`}
                    className="flex items-baseline gap-2 group no-underline"
                  >
                    <span className="text-sm text-neutral-900 dark:text-neutral-100 group-hover:underline">
                      {post.title}
                    </span>
                    <span className="text-xs text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
                      {post.comment_count} comment{post.comment_count !== 1 ? "s" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={`/community?tag=${encodeURIComponent(slug)}`}
              className="inline-block mt-3 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 no-underline"
            >
              View all discussions &rarr;
            </Link>
          </>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No discussions yet.{" "}
            <Link href="/community/submit" className="underline">
              Start one
            </Link>
            !
          </p>
        )}
      </div>

      {/* Related blog posts */}
      {relatedBlogPosts.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
            Related blog posts
          </h2>
          <ul className="space-y-2">
            {relatedBlogPosts.map((post) => (
              <li key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="flex items-baseline gap-2 group no-underline"
                >
                  <span className="text-sm text-neutral-900 dark:text-neutral-100 group-hover:underline">
                    {post.metadata.title}
                  </span>
                  <span className="text-xs text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
                    {post.metadata.publishedAt}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
