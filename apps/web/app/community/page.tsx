import Link from "next/link";
import { fetchPosts, fetchTagStats, fetchTrending } from "app/lib/community";
import { CommunityList } from "./CommunityList";
import { TagFilterBar } from "./TagFilterBar";
import { TrendingSidebar } from "./TrendingSidebar";
import { getProjectSlugs } from "app/projects/project-data";

interface Props {
  searchParams: Promise<{ sort?: string; type?: string; tag?: string; page?: string }>;
}

export const metadata = {
  title: "Community",
  description: "AI/ML community discussions on CodePawl",
};

const tabs = [
  { label: "Ranked", value: "ranked" },
  { label: "New", value: "new" },
  { label: "Show CodePawl", value: "show" },
];

export default async function CommunityPage({ searchParams }: Props) {
  const params = await searchParams;
  const sort = params.sort || "ranked";
  const type = params.type;
  const tag = params.tag;
  const page = Number(params.page) || 1;

  const projectSlugs = new Set(getProjectSlugs());
  const [data, tagStats, trending] = await Promise.all([
    fetchPosts(page, sort, type, tag),
    fetchTagStats(),
    fetchTrending(),
  ]);
  const allTags = tagStats.map((s) => s.name);
  const topTags = allTags.slice(0, 8);

  return (
    <div className="max-w-5xl mx-auto w-full lg:flex gap-8">
      <div className="flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          Community
        </h1>
        <Link
          href="/community/submit"
          className="px-3 py-1.5 text-sm font-medium rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors no-underline"
        >
          Submit
        </Link>
      </div>

      {/* Tabs — plain text with underline indicator */}
      <div className="flex gap-6 mb-4 border-b border-neutral-200 dark:border-neutral-800">
        {tabs.map((tab) => {
          const isActive =
            tab.value === "show"
              ? type === "show"
              : !type && sort === tab.value;
          const href =
            tab.value === "show"
              ? "/community?type=show"
              : `/community?sort=${tab.value}`;
          return (
            <Link
              key={tab.value}
              href={href}
              className={`pb-2 text-sm font-medium no-underline transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                  : "border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Tag filter bar */}
      <TagFilterBar
        topTags={topTags}
        allTags={allTags}
        activeTag={tag}
        sort={sort}
        projectSlugs={projectSlugs}
      />

      {/* Post list */}
      {data && data.posts.length > 0 ? (
        <CommunityList
          posts={data.posts}
          total={data.total}
          page={data.page}
          totalPages={data.total_pages}
          sort={sort}
          type={type}
        />
      ) : (
        <div className="text-center py-16">
          <svg className="mx-auto mb-3 w-10 h-10 text-neutral-300 dark:text-neutral-600" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
            <path d="M2.165 15.803l.02-.004c1.83-.363 2.948-.842 3.468-1.105A9 9 0 0 0 8 15c4.418 0 8-3.134 8-7s-3.582-7-8-7-8 3.134-8 7c0 1.76.743 3.37 1.97 4.6a10.4 10.4 0 0 1-.524 2.318l-.003.011a11 11 0 0 1-.244.637c-.079.186.074.394.273.362a22 22 0 0 0 .693-.125z"/>
          </svg>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm">
            No posts yet. Be the first to{" "}
            <Link href="/community/submit" className="underline">
              submit something
            </Link>
            !
          </p>
        </div>
      )}
      </div>

      <TrendingSidebar
        trending={trending}
        topTags={topTags}
        activeTag={tag}
        sort={sort}
        projectSlugs={projectSlugs}
      />
    </div>
  );
}
