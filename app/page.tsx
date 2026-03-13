import React from "react";
import type { Metadata } from "next";
import { getBlogPostsMetadata } from "app/lib/posts";
import { metaData, socialLinks } from "app/config";
import { HomePageContent } from "app/components/features/HomePageContent";

export const metadata: Metadata = {
  title: metaData.title,
  description: metaData.description,
  alternates: {
    canonical: metaData.baseUrl,
  },
  openGraph: {
    title: metaData.title,
    description: metaData.description,
    url: metaData.baseUrl,
    images: [`${metaData.baseUrl}/og?title=${encodeURIComponent(metaData.title)}`],
    siteName: metaData.name,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: metaData.title,
    description: metaData.description,
  },
};

export default function Page() {
  let allBlogs = getBlogPostsMetadata();
  let recentBlogs = allBlogs
    .sort((a, b) => {
      if (
        new Date(a.metadata.publishedAt) >
        new Date(b.metadata.publishedAt)
      ) {
        return -1;
      }
      return 1;
    })
    .slice(0, 3); // Top 3 posts

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Person",
            name: metaData.name,
            jobTitle: "Data Scientist & Machine Learning Engineer",
            description: metaData.description,
            url: metaData.baseUrl,
            sameAs: [
              socialLinks.github,
              socialLinks.linkedin,
              socialLinks.kaggle,
              socialLinks.youtube,
            ],
            image: `${metaData.baseUrl}/profile.png`,
          }),
        }}
      />
      <HomePageContent 
          recentBlogs={recentBlogs}
      />
    </>
  );
}
