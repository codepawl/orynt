import { redirect } from "next/navigation";
import Link from "next/link";
import { fetchWikiPages } from "app/lib/wiki";
import { WikiSidebar } from "./WikiSidebar";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function WikiIndexPage({ params }: Props) {
  const { slug } = await params;
  const pages = await fetchWikiPages(slug);

  // If pages exist, redirect to first page
  if (pages.length > 0) {
    const firstPage = pages.find((p) => !p.parent_id) || pages[0];
    redirect(`/projects/${slug}/wiki/${firstPage.slug}`);
  }

  // Empty state
  return (
    <div className="max-w-4xl mx-auto w-full">
      <nav className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        <Link href="/projects" className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline">
          Projects
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/projects/${slug}`} className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline">
          {slug}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-neutral-900 dark:text-neutral-100">Wiki</span>
      </nav>

      <div className="flex gap-6">
        <WikiSidebar pages={pages} projectSlug={slug} showAddButton />
        <main className="flex-1 text-center py-16">
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-3">
            No documentation yet
          </h1>
          <p className="text-neutral-500 mb-6">
            Start documenting this project by creating the first wiki page.
          </p>
          <Link
            href={`/projects/${slug}/wiki/new`}
            className="inline-flex px-5 py-2.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 transition-opacity no-underline"
          >
            Create first page
          </Link>
        </main>
      </div>
    </div>
  );
}
