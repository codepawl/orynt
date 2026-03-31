import Link from "next/link";
import { fetchPosts } from "app/lib/community";
import { CommunityList } from "./CommunityList";
import { CATEGORIES } from "@codepawl/shared";
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
  const data = await fetchPosts(page, sort, type, tag);

  return (
    <div className="max-w-3xl mx-auto w-full">
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

      {/* Tag filter — wrapping pill grid */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <Link
          href={`/community?sort=${sort}`}
          className={`px-2.5 py-1 text-xs font-medium rounded-full no-underline transition-colors ${
            !tag
              ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          }`}
        >
          All
        </Link>
        {CATEGORIES.filter((c) => c !== "general").map((cat) => {
          const isProjectTag = projectSlugs.has(cat);
          const href = isProjectTag
            ? `/projects/${cat}`
            : `/community?tag=${encodeURIComponent(cat)}&sort=${sort}`;
          return (
            <Link
              key={cat}
              href={href}
              className={`px-2.5 py-1 text-xs font-medium rounded-full no-underline transition-colors ${
                tag === cat
                  ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              }`}
            >
              {cat}
            </Link>
          );
        })}
      </div>

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
        <p className="text-neutral-500 text-center py-12">
          No posts yet. Be the first to{" "}
          <Link href="/community/submit" className="underline">
            submit something
          </Link>
          !
        </p>
      )}
    </div>
  );
}
