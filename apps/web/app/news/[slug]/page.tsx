import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchNewsArticle } from "app/lib/news";
import { fetchPostIdByArticle } from "app/lib/community";
import { metaData } from "app/config";
import { ChatDots } from "react-bootstrap-icons";

export const revalidate = 300;

export async function generateMetadata(
  props: { params: Promise<{ slug: string }> }
): Promise<Metadata | undefined> {
  const { slug } = await props.params;
  const article = await fetchNewsArticle(slug);
  if (!article) return;

  const title = article.meta_title || article.title;
  const description = article.meta_description || article.summary || "";

  return {
    title,
    description,
    alternates: {
      canonical: article.canonical_url || `${metaData.baseUrl}/news/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `${metaData.baseUrl}/news/${slug}`,
      type: "article",
      ...(article.published_at && {
        publishedTime: article.published_at,
      }),
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function NewsArticlePage(
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params;
  const article = await fetchNewsArticle(slug);

  if (!article) {
    notFound();
  }

  // Look up community post for cross-linking
  const communityPostId = await fetchPostIdByArticle(article.id);

  const publishedDate = article.published_at
    ? new Date(article.published_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const tags = article.tags
    ? article.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  return (
    <section>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: article.title,
            description: article.summary,
            url: `${metaData.baseUrl}/news/${slug}`,
            datePublished: article.published_at,
            keywords: article.tags,
            author: {
              "@type": "Organization",
              name: "CodePawl",
            },
            publisher: {
              "@type": "Organization",
              name: "CodePawl",
            },
          }),
        }}
      />

      <div style={{ marginBottom: 32 }}>
        <Link
          href="/news"
          className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 text-sm"
        >
          ← Back to News
        </Link>
      </div>

      <h1
        className="text-neutral-900 dark:text-neutral-100"
        style={{ marginBottom: 12 }}
      >
        {article.title}
      </h1>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {publishedDate && (
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            {publishedDate}
          </span>
        )}
        {article.canonical_url && (
          <>
            <span className="text-neutral-400 dark:text-neutral-500">·</span>
            <a
              href={article.canonical_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 text-sm"
            >
              Source ↗
            </a>
          </>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {tags.map((tag) => (
            <Link
              key={tag}
              href={`/news/tags/${tag}`}
              className="px-2 py-0.5 rounded text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors no-underline"
            >
              {tag}
            </Link>
          ))}
        </div>
      )}

      {article.summary && (
        <div className="prose prose-neutral dark:prose-invert max-w-none mb-8">
          <p
            className="text-neutral-700 dark:text-neutral-300"
            style={{ fontSize: 16, lineHeight: 1.7 }}
          >
            {article.summary}
          </p>
        </div>
      )}

      {article.canonical_url && (
        <div
          className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-6 text-center"
          style={{ marginTop: 32 }}
        >
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">
            Read the full article at the original source
          </p>
          <a
            href={article.canonical_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg hover:opacity-80 transition-opacity text-sm font-medium"
          >
            Read Original Article ↗
          </a>
        </div>
      )}

      {communityPostId && (
        <div className="mt-6 text-center">
          <Link
            href={`/community/post/${communityPostId}`}
            className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            <ChatDots className="w-4 h-4" />
            Discuss on Community
          </Link>
        </div>
      )}
    </section>
  );
}
