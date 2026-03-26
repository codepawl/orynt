import Link from "next/link";
import { fetchPosts } from "app/lib/community";
import { CommunityList } from "./CommunityList";

interface Props {
  searchParams: Promise<{ sort?: string; type?: string; page?: string }>;
}

export const metadata = {
  title: "Community",
  description: "AI/ML community discussions on CodePawl",
};

export default async function CommunityPage({ searchParams }: Props) {
  const params = await searchParams;
  const sort = params.sort || "ranked";
  const type = params.type;
  const page = Number(params.page) || 1;

  const data = await fetchPosts(page, sort, type);

  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Community</h1>
        <Link
          href="/community/submit"
          className="px-4 py-2 text-sm font-medium rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-80 transition-opacity no-underline"
        >
          Submit
        </Link>
      </div>

      <div className="flex gap-2 mb-4">
        {[
          { label: "Ranked", value: "ranked" },
          { label: "New", value: "new" },
          { label: "Show", value: "show" },
        ].map((tab) => {
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
              className={`px-3 py-1.5 text-sm font-medium rounded-md no-underline transition-colors ${
                isActive
                  ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

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
