import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { metaData } from "app/config";
import { fetchWikiPages, fetchWikiPage } from "app/lib/wiki";
import { WikiSidebar } from "../WikiSidebar";
import { MarkdownRenderer } from "app/components/ui/MarkdownRenderer";

interface Props {
  params: Promise<{ slug: string; pageSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, pageSlug } = await params;
  const page = await fetchWikiPage(slug, pageSlug);
  if (!page) return { title: "Page not found" };

  return {
    title: `${page.title} — ${slug} Wiki`,
    description: page.content.slice(0, 160),
    alternates: { canonical: `${metaData.baseUrl}projects/${slug}/wiki/${pageSlug}` },
  };
}

export default async function WikiPageView({ params }: Props) {
  const { slug, pageSlug } = await params;
  const [pages, page] = await Promise.all([
    fetchWikiPages(slug),
    fetchWikiPage(slug, pageSlug),
  ]);

  if (!page) notFound();

  // Find prev/next pages for navigation
  const flatPages = pages.filter((p) => !p.parent_id || true); // all pages in order
  const currentIndex = flatPages.findIndex((p) => p.slug === pageSlug);
  const prevPage = currentIndex > 0 ? flatPages[currentIndex - 1] : null;
  const nextPage = currentIndex < flatPages.length - 1 ? flatPages[currentIndex + 1] : null;

  return (
    <div className="max-w-5xl mx-auto w-full">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        <Link href="/projects" className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline">
          Projects
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/projects/${slug}`} className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline">
          {slug}
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/projects/${slug}/wiki`} className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline">
          Wiki
        </Link>
        <span className="mx-2">/</span>
        <span className="text-neutral-900 dark:text-neutral-100">{page.title}</span>
      </nav>

      <div className="flex gap-6">
        <WikiSidebar pages={pages} projectSlug={slug} showAddButton />

        <main className="flex-1 min-w-0 max-w-3xl">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">
            {page.title}
          </h1>

          <MarkdownRenderer
            content={page.content}
            repo={{ owner: "codepawl", name: slug }}
          />

          {/* Metadata footer */}
          <div className="mt-8 pt-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
            <span>
              Last updated{" "}
              {new Date(page.updated_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              {page.author && ` by ${page.author.display_name || page.author.username}`}
            </span>
            <Link
              href={`/projects/${slug}/wiki/${pageSlug}/edit`}
              className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 no-underline"
            >
              Edit this page
            </Link>
          </div>

          {/* Prev/Next navigation */}
          {(prevPage || nextPage) && (
            <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-800 flex justify-between">
              {prevPage ? (
                <Link
                  href={`/projects/${slug}/wiki/${prevPage.slug}`}
                  className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 no-underline"
                >
                  &larr; {prevPage.title}
                </Link>
              ) : (
                <span />
              )}
              {nextPage && (
                <Link
                  href={`/projects/${slug}/wiki/${nextPage.slug}`}
                  className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 no-underline"
                >
                  {nextPage.title} &rarr;
                </Link>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
