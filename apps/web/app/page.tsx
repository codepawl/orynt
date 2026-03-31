import type { Metadata } from "next";
import { metaData, founderLinks } from "app/config";
import { fetchBlogPosts } from "app/lib/blog";
import { HomePageContent } from "app/components/features/HomePageContent";

export const revalidate = 600;

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

export default async function Page() {
  const data = await fetchBlogPosts(1);
  const recentBlogs = (data?.posts ?? []).slice(0, 3);

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
              founderLinks.github,
              founderLinks.linkedin,
              founderLinks.kaggle,
            ],
            image: `${metaData.baseUrl}/profile.png`,
          }),
        }}
      />
      <HomePageContent recentBlogs={recentBlogs} />
    </>
  );
}
