import type { Metadata } from "next";
import { fetchNews, fetchNewsTags } from "app/lib/news";
import { metaData } from "app/config";
import { NewsListClient } from "./NewsListClient";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "AI/ML News",
  description:
    "Curated daily AI and machine learning news from top sources — research papers, industry updates, and open-source tools.",
  alternates: {
    canonical: `${metaData.baseUrl}/news`,
  },
  openGraph: {
    title: "AI/ML News | CodePawl",
    description:
      "Curated daily AI and machine learning news from top sources.",
    url: `${metaData.baseUrl}/news`,
    siteName: metaData.name,
    locale: "en_US",
    type: "website",
  },
};

export default async function NewsPage() {
  const [newsData, tags] = await Promise.all([
    fetchNews(1),
    fetchNewsTags(),
  ]);

  return (
    <section>
      <h1 className="mb-2 text-2xl font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
        AI/ML News
      </h1>
      <p className="mb-8 text-neutral-600 dark:text-neutral-400 text-sm">
        Curated daily from top sources
      </p>
      <NewsListClient
        initialArticles={newsData?.articles || []}
        initialTotal={newsData?.total || 0}
        initialTotalPages={newsData?.total_pages || 0}
        tags={tags || []}
      />
    </section>
  );
}
