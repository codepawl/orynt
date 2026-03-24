import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomMDX } from "app/components/ui/mdx";
import { getBlogPosts } from "app/lib/posts";
import { estimateReadingTimeMinutes, formatDate } from "app/lib/utils";
import { metaData } from "app/config";
import { BlogPostHeader } from "./BlogPostHeader";

export async function generateStaticParams() {
  let posts = getBlogPosts();

  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata(props): Promise<Metadata | undefined> {
  const params = await props.params;
  let post = getBlogPosts().find((post) => post.slug === params.slug);
  if (!post) {
    return;
  }

  let {
    title,
    publishedAt: publishedTime,
    summary: description,
    image,
  } = post.metadata;
  let ogImage = image
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
  let post = getBlogPosts().find((post) => post.slug === params.slug);

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
    </section>
  );
}
