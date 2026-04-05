import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchBlogPost } from "app/lib/blog";
import { metaData } from "app/config";
import { BlogPostHeader } from "./BlogPostHeader";
import { ReadingProgressBar } from "app/components/ui/ReadingProgressBar";
import { ShareButtons } from "app/components/ui/ShareButtons";
import { ChatDots } from "react-bootstrap-icons";

export const revalidate = 600;

export async function generateMetadata(
  props: { params: Promise<{ slug: string }> }
): Promise<Metadata | undefined> {
  const { slug } = await props.params;
  const post = await fetchBlogPost(slug);
  if (!post) return;

  const title = post.title;
  const description = post.summary ?? "";
  const ogImage = post.cover_image_url
    ? post.cover_image_url
    : `${metaData.baseUrl}/og?title=${encodeURIComponent(title)}`;

  return {
    title,
    description,
    alternates: {
      canonical: `${metaData.baseUrl}/blog/${post.slug}`,
    },
    openGraph: {
      title,
      description,
      type: "article",
      publishedTime: post.published_at ?? undefined,
      url: `${metaData.baseUrl}/blog/${post.slug}`,
      images: [{ url: ogImage }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function BlogPostPage(
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params;
  const post = await fetchBlogPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <section>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            datePublished: post.published_at,
            dateModified: post.updated_at,
            description: post.summary,
            image: post.cover_image_url
              ? post.cover_image_url
              : `/og?title=${encodeURIComponent(post.title)}`,
            url: `${metaData.baseUrl}/blog/${post.slug}`,
            author: {
              "@type": "Person",
              name: post.author.display_name ?? post.author.username,
              url: `${metaData.baseUrl}/profile/${post.author.username}`,
            },
          }),
        }}
      />
      <BlogPostHeader
        title={post.title}
        publishedAt={post.published_at ?? post.created_at}
        readingTimeMinutes={post.reading_time_minutes ?? undefined}
      />
      <ReadingProgressBar />
      <article
        className="prose prose-quoteless prose-neutral dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: post.content }}
      />
      <div className="mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-700">
        <ShareButtons url={`/blog/${post.slug}`} title={post.title} />
        <div className="mt-4 text-center">
          <Link
            href={`/community/submit?type=link&title=${encodeURIComponent(post.title)}&url=${encodeURIComponent(`${metaData.baseUrl}/blog/${post.slug}`)}`}
            className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            <ChatDots className="w-4 h-4" />
            Discuss this post on Community
          </Link>
        </div>
      </div>
    </section>
  );
}
