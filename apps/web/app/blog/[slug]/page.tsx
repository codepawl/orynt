import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CustomMDX } from "app/components/ui/mdx";
import { getBlogPosts } from "app/lib/posts";
import { estimateReadingTimeMinutes } from "app/lib/utils";
import { metaData } from "app/config";
import { BlogPostHeader } from "./BlogPostHeader";
import { ChatDots } from "react-bootstrap-icons";

export async function generateStaticParams() {
  const posts = getBlogPosts();

  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata(props): Promise<Metadata | undefined> {
  const params = await props.params;
  const post = getBlogPosts().find((post) => post.slug === params.slug);
  if (!post) {
    return;
  }

  const {
    title,
    publishedAt: publishedTime,
    summary: description,
    image,
  } = post.metadata;
  const ogImage = image
    ? image
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
      publishedTime,
      url: `${metaData.baseUrl}/blog/${post.slug}`,
      images: [
        {
          url: ogImage,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function Blog(props) {
  const params = await props.params;
  const post = getBlogPosts().find((post) => post.slug === params.slug);

  if (!post) {
    notFound();
  }

  const readingTimeMinutes = estimateReadingTimeMinutes(post.content);

  return (
    <section>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.metadata.title,
            datePublished: post.metadata.publishedAt,
            dateModified: post.metadata.publishedAt,
            description: post.metadata.summary,
            image: post.metadata.image
              ? `${metaData.baseUrl}${post.metadata.image}`
              : `/og?title=${encodeURIComponent(post.metadata.title)}`,
            url: `${metaData.baseUrl}/blog/${post.slug}`,
            author: {
              "@type": "Person",
              name: metaData.name,
              url: `${metaData.baseUrl}profile`,
            },
          }),
        }}
      />
      <BlogPostHeader
        title={post.metadata.title}
        publishedAt={post.metadata.publishedAt}
        readingTimeMinutes={readingTimeMinutes}
      />
      <article className="prose prose-quoteless prose-neutral dark:prose-invert max-w-none">
        <CustomMDX source={post.content} />
      </article>
      <div className="mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-700 text-center">
        <Link
          href={`/community/submit?type=link&title=${encodeURIComponent(post.metadata.title)}&url=${encodeURIComponent(`${metaData.baseUrl}/blog/${post.slug}`)}`}
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
        >
          <ChatDots className="w-4 h-4" />
          Discuss this post on Community
        </Link>
      </div>
    </section>
  );
}
