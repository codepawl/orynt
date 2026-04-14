import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { metaData } from "app/config";
import { CustomMDX } from "app/components/ui/mdx";
import { getProjectBySlug } from "../../../project-data";
import { fetchOrgRepos } from "app/lib/projects";
import {
  fetchDocContent,
  extractHeadings,
  parseFrontmatter,
} from "app/lib/github-docs";
import { Breadcrumb } from "../_components/Breadcrumb";
import { TableOfContents } from "../_components/TableOfContents";

interface Props {
  params: Promise<{ slug: string; docSlug?: string[] }>;
}

async function resolveRepo(slug: string): Promise<{
  fullName: string;
  displayName: string;
} | null> {
  const staticProject = getProjectBySlug(slug);
  if (staticProject) {
    try {
      const url = new URL(staticProject.url);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return {
          fullName: `${parts[0]}/${parts[1]}`,
          displayName: staticProject.title,
        };
      }
    } catch { /* ignore */ }
  }

  const orgRepos = await fetchOrgRepos();
  const orgRepo = orgRepos.find((r) => r.name === slug);
  if (orgRepo) {
    return {
      fullName: orgRepo.full_name,
      displayName: orgRepo.name,
    };
  }

  return { fullName: `codepawl/${slug}`, displayName: slug };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, docSlug } = await params;
  const repo = await resolveRepo(slug);
  if (!repo) return {};

  const docPath = docSlug?.length ? docSlug.join("/") : "index";
  const fullPath = docPath.endsWith(".mdx") ? docPath : `${docPath}.mdx`;

  try {
    const doc = await fetchDocContent(repo.fullName, fullPath);
    const { frontmatter } = parseFrontmatter(doc.content);

    const title = frontmatter.title || docPath.split("/").pop()?.replace(/-/g, " ") || "Docs";
    const description = frontmatter.description || `Documentation for ${repo.displayName}`;

    return {
      title: `${title} — ${repo.displayName} Docs`,
      description,
      alternates: {
        canonical: `${metaData.baseUrl}projects/${slug}/docs${docSlug?.length ? `/${docSlug.join("/")}` : ""}`,
      },
    };
  } catch {
    return {
      title: `Docs — ${repo.displayName}`,
    };
  }
}

export const revalidate = 7200;

export default async function ProjectDocPage({ params }: Props) {
  const { slug, docSlug } = await params;
  const repo = await resolveRepo(slug);
  if (!repo) notFound();

  const docPath = docSlug?.length ? docSlug.join("/") : "index";
  const fullPath = docPath.endsWith(".mdx") ? docPath : `${docPath}.mdx`;

  let doc;
  try {
    doc = await fetchDocContent(repo.fullName, fullPath);
  } catch {
    notFound();
  }

  const { frontmatter, content } = parseFrontmatter(doc.content);
  const headings = extractHeadings(content);

  const title = frontmatter.title || docPath.split("/").pop()?.replace(/-/g, " ") || "Documentation";

  return (
    <div className="flex-1 min-w-0 flex gap-8">
      <article className="flex-1 min-w-0 max-w-3xl">
        <Breadcrumb
          projectSlug={slug}
          projectName={repo.displayName}
          docPath={docSlug ?? []}
        />
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 mb-8">
          {title}
        </h1>
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <CustomMDX source={content} />
        </div>
      </article>
      <TableOfContents headings={headings} />
    </div>
  );
}
