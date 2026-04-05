/**
 * One-time migration script: MDX files → blog_posts DB table
 *
 * Usage:
 *   SUPABASE_JWT=<your-admin-jwt> bun run scripts/migrate-mdx-to-db.ts
 *
 * Reads all .mdx files from apps/web/content/, converts markdown body to HTML,
 * and POSTs each to POST /api/blog/posts (requires admin JWT or API key).
 *
 * MDX-specific components (RepoCard, YouTube, Callout, etc.) are stripped.
 * Re-running is safe — the API returns 409 if the slug already exists.
 */

import fs from "fs";
import path from "path";

// ---- Config ---------------------------------------------------------------

const API_BASE = process.env.API_BASE ?? "http://localhost:8000";
const JWT = process.env.SUPABASE_JWT;
const API_KEY = process.env.ADMIN_API_KEY;
const CONTENT_DIR = path.join(
  path.dirname(import.meta.url.replace("file://", "")),
  "../apps/web/content"
);

if (!JWT && !API_KEY) {
  console.error(
    "Error: set SUPABASE_JWT or ADMIN_API_KEY env var before running."
  );
  process.exit(1);
}

// ---- Frontmatter parser ---------------------------------------------------

interface Frontmatter {
  title: string;
  publishedAt: string;
  summary: string;
  tags?: string;
  image?: string;
}

function parseFrontmatter(raw: string): { meta: Frontmatter; body: string } {
  const match = /^---\s*([\s\S]*?)\s*---\s*/m.exec(raw);
  if (!match) throw new Error("No frontmatter found");

  const block = match[1];
  const body = raw.slice(match[0].length).trim();
  const meta: Partial<Frontmatter> = {};

  for (const line of block.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line
      .slice(colonIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    (meta as Record<string, string>)[key] = value;
  }

  return { meta: meta as Frontmatter, body };
}

// ---- Minimal Markdown → HTML converter ------------------------------------
// Handles: headings, bold/italic, inline code, code blocks, links, lists,
// blockquotes, horizontal rules, and paragraphs.
// MDX components (lines starting with <Component or import) are stripped.

function markdownToHtml(md: string): string {
  // Strip MDX-specific lines: imports, JSX component tags
  const lines = md.split("\n");
  const cleaned: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      cleaned.push(line);
      continue;
    }
    if (!inCodeBlock) {
      // Skip import statements
      if (/^import\s+/.test(line)) continue;
      // Skip JSX self-closing or opening tags for known components
      if (/^<(RepoCard|YouTube|Callout|Tweet|StaticTweet)[^>]*\/>?/.test(line))
        continue;
      if (/^<\/(RepoCard|YouTube|Callout|Tweet|StaticTweet)>/.test(line))
        continue;
    }
    cleaned.push(line);
  }

  let text = cleaned.join("\n");

  // Code blocks
  text = text.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_m, lang, code) =>
      `<pre><code class="language-${lang}">${escapeHtml(code.trimEnd())}</code></pre>`
  );

  // Inline code
  text = text.replace(/`([^`]+)`/g, (_m, c) => `<code>${escapeHtml(c)}</code>`);

  // Bold + italic
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  text = text.replace(/_([^_]+)_/g, "<em>$1</em>");

  // Links
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Images (strip — no external images in DB)
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");

  // Process line by line for block elements
  const blockLines = text.split("\n");
  const output: string[] = [];
  let i = 0;

  while (i < blockLines.length) {
    const line = blockLines[i];

    // Already processed block (pre)
    if (line.startsWith("<pre>")) {
      output.push(line);
      i++;
      continue;
    }

    // Headings
    const hMatch = /^(#{1,6})\s+(.+)/.exec(line);
    if (hMatch) {
      const level = hMatch[1].length;
      output.push(`<h${level}>${hMatch[2]}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      output.push("<hr/>");
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const bqLines: string[] = [];
      while (i < blockLines.length && blockLines[i].startsWith("> ")) {
        bqLines.push(blockLines[i].slice(2));
        i++;
      }
      output.push(`<blockquote>${bqLines.join(" ")}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < blockLines.length && /^[-*+]\s/.test(blockLines[i])) {
        items.push(`<li>${blockLines[i].replace(/^[-*+]\s/, "")}</li>`);
        i++;
      }
      output.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < blockLines.length && /^\d+\.\s/.test(blockLines[i])) {
        items.push(`<li>${blockLines[i].replace(/^\d+\.\s/, "")}</li>`);
        i++;
      }
      output.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Paragraph (non-empty)
    if (line.trim() !== "") {
      output.push(`<p>${line}</p>`);
    }

    i++;
  }

  return output.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---- Reading time ---------------------------------------------------------

function readingTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// ---- Main -----------------------------------------------------------------

const headers: Record<string, string> = {
  "Content-Type": "application/json",
};
if (JWT) headers["Authorization"] = `Bearer ${JWT}`;
if (API_KEY) headers["X-Admin-Key"] = API_KEY;

const mdxFiles = fs
  .readdirSync(CONTENT_DIR)
  .filter((f) => f.endsWith(".mdx"));

console.log(`Found ${mdxFiles.length} MDX files in ${CONTENT_DIR}\n`);

for (const file of mdxFiles) {
  const slug = path.basename(file, ".mdx");
  const raw = fs.readFileSync(path.join(CONTENT_DIR, file), "utf-8");

  let meta: Frontmatter;
  let body: string;
  try {
    ({ meta, body } = parseFrontmatter(raw));
  } catch (e) {
    console.warn(`  [SKIP] ${file} — ${e}`);
    continue;
  }

  const html = markdownToHtml(body);
  const minutes = readingTime(html);

  const payload = {
    title: meta.title,
    slug,
    content: html,
    content_markdown: body,
    summary: meta.summary,
    tags: meta.tags ?? "",
    cover_image_url: meta.image ?? null,
    status: "published",
    reading_time_minutes: minutes,
    published_at: new Date(meta.publishedAt).toISOString(),
  };

  process.stdout.write(`Migrating "${meta.title}" (${slug})… `);

  try {
    const res = await fetch(`${API_BASE}/api/blog/posts`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (res.status === 409) {
      console.log("already exists, skipped.");
      continue;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`FAILED (${res.status}): ${JSON.stringify(err)}`);
      continue;
    }

    const created = await res.json();
    console.log(`OK (id=${created.id})`);
  } catch (e) {
    console.error(`ERROR: ${e}`);
  }
}

console.log("\nDone.");
