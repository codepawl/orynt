/**
 * GitHub-based documentation fetcher.
 * Reads MDX files from a /docs/ folder in a GitHub repo and builds navigation.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface DocFile {
  path: string;   // relative to docs/, e.g. "installation.mdx"
  name: string;   // display name derived from filename
  sha: string;
}

export interface DocTree {
  files: DocFile[];
}

export interface DocContent {
  content: string; // raw MDX string
  sha: string;
  path: string;
}

export interface DocNavItem {
  title: string;
  slug: string;
  children?: DocNavItem[];
}

export interface DocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

// ── Helpers ──────────────────────────────────────────────────────────

function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function titleFromFilename(filename: string): string {
  const name = filename.replace(/\.mdx$/, "");
  if (name === "index") return "Overview";
  return name
    .replace(/-/g, " ")
    .replace(/\b\w/, (c) => c.toUpperCase());
}

function slugFromPath(filePath: string): string {
  return filePath
    .replace(/\.mdx$/, "")
    .replace(/\/index$/, "")
    .replace(/^index$/, "");
}

// ── Tree fetcher ─────────────────────────────────────────────────────

interface GitHubTreeItem {
  path: string;
  type: string;
  sha: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export async function fetchDocTree(repoFullName: string): Promise<DocTree> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/trees/HEAD?recursive=1`,
      {
        headers: getGitHubHeaders(),
        signal: controller.signal,
        next: { revalidate: 7200 },
      },
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`GitHub API error (${res.status}): failed to fetch tree for ${repoFullName}`);
    }

    const data: GitHubTreeResponse = await res.json();

    const files: DocFile[] = data.tree
      .filter(
        (item) =>
          item.type === "blob" &&
          item.path.startsWith("docs/") &&
          item.path.endsWith(".mdx"),
      )
      .map((item) => {
        const relativePath = item.path.slice("docs/".length);
        const filename = relativePath.split("/").pop() || relativePath;
        return {
          path: relativePath,
          name: titleFromFilename(filename),
          sha: item.sha,
        };
      });

    return { files };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timeout fetching doc tree for ${repoFullName}`);
    }
    throw error;
  }
}

// ── Content fetcher ──────────────────────────────────────────────────

interface GitHubContentResponse {
  content: string;
  sha: string;
  path: string;
  encoding: string;
}

export async function fetchDocContent(
  repoFullName: string,
  docPath: string,
): Promise<DocContent> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/docs/${docPath}`,
      {
        headers: getGitHubHeaders(),
        signal: controller.signal,
        next: { revalidate: 7200 },
      },
    );

    clearTimeout(timeoutId);

    if (res.status === 404) {
      throw new Error(`Document not found: docs/${docPath} in ${repoFullName}`);
    }
    if (!res.ok) {
      throw new Error(`GitHub API error (${res.status}): failed to fetch docs/${docPath}`);
    }

    const data: GitHubContentResponse = await res.json();
    const decoded = Buffer.from(data.content, "base64").toString("utf-8");

    return {
      content: decoded,
      sha: data.sha,
      path: data.path,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timeout fetching doc content for docs/${docPath}`);
    }
    throw error;
  }
}

// ── Nav builder ──────────────────────────────────────────────────────

export function buildNavFromTree(tree: DocTree): DocNavItem[] {
  const rootItems: DocNavItem[] = [];
  const folders = new Map<string, DocNavItem[]>();

  for (const file of tree.files) {
    const parts = file.path.split("/");

    if (parts.length === 1) {
      // Root-level file
      rootItems.push({
        title: titleFromFilename(parts[0]),
        slug: slugFromPath(file.path),
      });
    } else {
      // Nested file — group by first folder
      const folder = parts[0];
      if (!folders.has(folder)) {
        folders.set(folder, []);
      }
      folders.get(folder)!.push({
        title: titleFromFilename(parts[parts.length - 1]),
        slug: slugFromPath(file.path),
      });
    }
  }

  // Sort root items: Overview first, then alphabetical
  rootItems.sort((a, b) => {
    if (a.slug === "") return -1;
    if (b.slug === "") return 1;
    return a.title.localeCompare(b.title);
  });

  // Add folder groups after root items
  for (const [folder, children] of Array.from(folders.entries())) {
    // Sort children: Overview first, then alphabetical
    children.sort((a, b) => {
      const aIsIndex = a.slug === folder;
      const bIsIndex = b.slug === folder;
      if (aIsIndex) return -1;
      if (bIsIndex) return 1;
      return a.title.localeCompare(b.title);
    });

    rootItems.push({
      title: titleFromFilename(folder + ".mdx"),
      slug: folder,
      children,
    });
  }

  return rootItems;
}

// ── Heading extractor ────────────────────────────────────────────────

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/&/g, "-and-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");
}

export function extractHeadings(mdx: string): DocHeading[] {
  const headings: DocHeading[] = [];
  const lines = mdx.split("\n");

  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length as 2 | 3;
      const text = match[2].trim();
      headings.push({
        id: slugifyHeading(text),
        text,
        level,
      });
    }
  }

  return headings;
}

// ── Frontmatter parser ───────────────────────────────────────────────

export interface DocFrontmatter {
  title: string;
  description: string;
}

export function parseFrontmatter(raw: string): {
  frontmatter: DocFrontmatter;
  content: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return {
      frontmatter: { title: "", description: "" },
      content: raw,
    };
  }

  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      fm[key] = value;
    }
  }

  return {
    frontmatter: {
      title: fm.title || "",
      description: fm.description || "",
    },
    content: match[2],
  };
}
