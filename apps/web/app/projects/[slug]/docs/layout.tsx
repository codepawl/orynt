import Link from "next/link";
import { ArrowLeft } from "react-bootstrap-icons";
import { getProjectBySlug } from "../../project-data";
import { fetchOrgRepos } from "app/lib/projects";
import { fetchDocTree, buildNavFromTree, type DocNavItem } from "app/lib/github-docs";
import { DocsSidebar } from "./_components/DocsSidebar";

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

async function resolveRepoFullName(slug: string): Promise<string | null> {
  // Try static data first
  const staticProject = getProjectBySlug(slug);
  if (staticProject) {
    try {
      const url = new URL(staticProject.url);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    } catch { /* ignore */ }
  }

  // Try org repos
  const orgRepos = await fetchOrgRepos();
  const orgRepo = orgRepos.find((r) => r.name === slug);
  if (orgRepo) return orgRepo.full_name;

  // Default to codepawl org
  return `codepawl/${slug}`;
}

export default async function ProjectDocsLayout({ children, params }: Props) {
  const { slug } = await params;
  const repoFullName = await resolveRepoFullName(slug);

  let nav: DocNavItem[] | null = null;
  let error = false;

  if (repoFullName) {
    try {
      const tree = await fetchDocTree(repoFullName);
      if (tree.files.length > 0) {
        nav = buildNavFromTree(tree);
      }
    } catch {
      error = true;
    }
  }

  // Empty state: no docs found
  if (!nav || nav.length === 0) {
    return (
      <div className="max-w-3xl mx-auto w-full">
        <Link
          href={`/projects/${slug}`}
          className="inline-flex items-center gap-1.5 mb-6 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 no-underline transition-colors"
        >
          <ArrowLeft size={14} />
          Back to project
        </Link>
        <div className="text-center py-16">
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-3">
            {error ? "Unable to load documentation" : "No documentation yet"}
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400">
            {error
              ? "There was a problem fetching docs from GitHub. Try again later."
              : "This project has not added documentation yet. Add a docs/ folder with .mdx files to the repository to get started."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      <Link
        href={`/projects/${slug}`}
        className="inline-flex items-center gap-1.5 mb-6 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 no-underline transition-colors"
      >
        <ArrowLeft size={14} />
        Back to project
      </Link>
      <div className="lg:flex lg:gap-8">
        <DocsSidebar nav={nav} projectSlug={slug} currentDocSlug="" />
        {children}
      </div>
    </div>
  );
}
