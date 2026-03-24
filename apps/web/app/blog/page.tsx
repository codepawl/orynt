import type { Metadata } from "next";
import { getBlogPostsMetadata } from "app/lib/posts";
import { metaData } from "app/config";
import { BlogListClient } from "./BlogListClient";

export const metadata: Metadata = {
  title: "Blog",
  description: "Explore insights in AI, data science, and machine learning through in-depth articles, tutorials, and guides by Nguyen Xuan An.",
  alternates: {
    canonical: `${metaData.baseUrl}blog`,
  },
  openGraph: {
    title: "Blog | CodePawl",
    description: "Explore insights in AI, data science, and machine learning through in-depth articles, tutorials, and guides.",
    url: `${metaData.baseUrl}blog`,
    images: [`${metaData.baseUrl}/og?title=${encodeURIComponent("Blog | CodePawl")}`],
    siteName: metaData.name,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog | CodePawl",
    description: "Explore insights in AI, data science, and machine learning through in-depth articles, tutorials, and guides.",
  },
};

export default function BlogPosts() {
  const allBlogs = getBlogPostsMetadata();

  const sortedBlogs = allBlogs.sort((a, b) => {
    if (
      new Date(a.metadata.publishedAt) >
      new Date(b.metadata.publishedAt)
    ) {
      return -1;
    }
    return 1;
  });

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Blog | CodePawl",
            description: "Explore insights in AI, data science, and machine learning through in-depth articles, tutorials, and guides.",
            url: `${metaData.baseUrl}blog`,
            mainEntity: {
              "@type": "Blog",
              name: "CodePawl Blog",
              description: "Articles on AI, data science, and machine learning",
            },
          }),
        }}
      />
      <section>
        <h1 className="mb-8 text-2xl font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
          Our Blog
        </h1>
        <BlogListClient posts={sortedBlogs} />
      </section>
    </>
  );
}
