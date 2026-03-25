import type { Metadata } from "next";
import { fetchNews, fetchNewsTags } from "app/lib/news";
import { metaData } from "app/config";
import { NewsListClient } from "../../NewsListClient";

export const revalidate = 300;

export async function generateMetadata(
  props: { params: Promise<{ tag: string }> }
): Promise<Metadata> {
  const { tag } = await props.params;
  const decodedTag = decodeURIComponent(tag);

  return {
    title: `AI/ML News — #${decodedTag}`,
    description: `Latest AI/ML news tagged with "${decodedTag}" — curated from top sources.`,
    alternates: {
      canonical: `${metaData.baseUrl}/news/tags/${tag}`,
    },
  };
}

export default async function NewsTagPage(
  props: { params: Promise<{ tag: string }> }
) {
  const { tag } = await props.params;
  const decodedTag = decodeURIComponent(tag);

  const [newsData, tags] = await Promise.all([
    fetchNews(1, decodedTag),
    fetchNewsTags(),
  ]);

  return (
    <section>
      <h1 className="mb-2 text-2xl font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
        AI/ML News — #{decodedTag}
      </h1>
      <p className="mb-8 text-neutral-600 dark:text-neutral-400 text-sm">
        Curated daily from top sources
      </p>
      <NewsListClient
        initialArticles={newsData?.articles || []}
        initialTotal={newsData?.total || 0}
        initialTotalPages={newsData?.total_pages || 0}
        tags={tags || []}
        activeTag={decodedTag}
      />
    </section>
  );
}
