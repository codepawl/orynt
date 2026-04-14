import { notFound } from "next/navigation";
import path from "path";
import fs from "fs";
import type { Metadata } from "next";
import { metaData } from "app/config";
import { CustomMDX } from "app/components/ui/mdx";
import { Breadcrumb } from "../_components/Breadcrumb";
import { TableOfContents, type TocHeading } from "../_components/TableOfContents";

const CONTENT_DIR = path.join(process.cwd(), "content", "docs");

interface Frontmatter {
  title: string;
  description: string;
}

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return {
      frontmatter: { title: "Untitled", description: "" },
      content: raw,
    };
  }

  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      fm[key] = value;
    }
  }

  return {
    frontmatter: {
      title: fm.title || "Untitled",
      description: fm.description || "",
    },
    content: match[2],
  };
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/&/g, "-and-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");
}

function extractHeadings(source: string): TocHeading[] {
  const headings: TocHeading[] = [];
  const lines = source.split("\n");

  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      headings.push({ id: slugify(text), text, level });
    }
  }

  return headings;
}

function resolveFilePath(slugParts: string[]): string | null {
  // Try slug/index.mdx first, then slug.mdx
  const joinedSlug = slugParts.join("/");

  const indexPath = path.join(CONTENT_DIR, joinedSlug, "index.mdx");
  if (fs.existsSync(indexPath)) return indexPath;

  const directPath = path.join(CONTENT_DIR, `${joinedSlug}.mdx`);
  if (fs.existsSync(directPath)) return directPath;

  return null;
}

function getAllDocSlugs(): string[][] {
  const slugs: string[][] = [];

  function walk(dir: string, prefix: string[]) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), [...prefix, entry.name]);
      } else if (entry.name.endsWith(".mdx")) {
        if (entry.name === "index.mdx") {
          slugs.push(prefix);
        } else {
          slugs.push([...prefix, entry.name.replace(/\.mdx$/, "")]);
        }
      }
    }
  }

  walk(CONTENT_DIR, []);
  return slugs;
}

export function generateStaticParams(): Array<{ slug?: string[] }> {
  const slugs = getAllDocSlugs();
  // Include the root /docs page (empty slug)
  return [{ slug: undefined }, ...slugs.map((s) => ({ slug: s }))];
}

interface Props {
  params: Promise<{ slug?: string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const slugParts = slug ?? [];

  const filePath = resolveFilePath(slugParts.length === 0 ? [] : slugParts);
  if (!filePath) return {};

  const raw = fs.readFileSync(filePath, "utf-8");
  const { frontmatter } = parseFrontmatter(raw);

  return {
    title: frontmatter.title,
    description: frontmatter.description,
    alternates: {
      canonical: `${metaData.baseUrl}docs${slugParts.length > 0 ? `/${slugParts.join("/")}` : ""}`,
    },
  };
}

export const revalidate = 3600;

export default async function DocsPage({ params }: Props) {
  const { slug } = await params;
  const slugParts = slug ?? [];

  // Root /docs → content/docs/index.mdx
  const filePath = resolveFilePath(slugParts.length === 0 ? [] : slugParts);
  if (!filePath) notFound();

  const raw = fs.readFileSync(filePath, "utf-8");
  const { frontmatter, content } = parseFrontmatter(raw);
  const headings = extractHeadings(content);

  return (
    <div className="flex-1 min-w-0 flex gap-8">
      <article className="flex-1 min-w-0 max-w-3xl">
        <Breadcrumb />
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 mb-8">
          {frontmatter.title}
        </h1>
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <CustomMDX source={content} />
        </div>
      </article>
      <TableOfContents headings={headings} />
    </div>
  );
}
