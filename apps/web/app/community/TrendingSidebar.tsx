import Link from "next/link";
import { StarFill, ChatDots } from "react-bootstrap-icons";
import type { CommunityPost } from "@codepawl/shared";

interface Props {
  trending: CommunityPost[];
  topTags: string[];
  activeTag?: string;
  sort: string;
  projectSlugs: Set<string>;
}

export function TrendingSidebar({ trending, topTags, activeTag, sort, projectSlugs }: Props) {
  if (trending.length === 0 && topTags.length === 0) return null;

  return (
    <aside className="hidden lg:block w-72 flex-shrink-0">
      <div className="sticky top-20 space-y-6">
        {/* Trending this week */}
        {trending.length > 0 && (
          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900/50 p-4">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
              Trending this week
            </h3>
            <ol className="space-y-2.5">
              {trending.map((post, i) => (
                <li key={post.id}>
                  <Link
                    href={`/community/post/${post.id}`}
                    className="group no-underline block"
                  >
                    <span className="text-sm text-neutral-800 dark:text-neutral-200 group-hover:underline leading-snug line-clamp-2">
                      <span className="text-neutral-400 dark:text-neutral-500 mr-1.5">{i + 1}.</span>
                      {post.title.length > 60 ? post.title.slice(0, 60) + "…" : post.title}
                    </span>
                    <span className="flex items-center gap-3 mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                      <span className="flex items-center gap-1">
                        <StarFill size={10} /> {post.score}
                      </span>
                      <span className="flex items-center gap-1">
                        <ChatDots size={10} /> {post.comment_count}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Popular tags */}
        {topTags.length > 0 && (
          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900/50 p-4">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
              Popular tags
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {topTags.map((tag) => {
                const isProject = projectSlugs.has(tag);
                const href = isProject
                  ? `/projects/${tag}`
                  : `/community?tag=${encodeURIComponent(tag)}&sort=${sort}`;
                return (
                  <Link
                    key={tag}
                    href={href}
                    className={`px-2.5 py-1 text-xs font-medium rounded-full no-underline transition-colors ${
                      activeTag === tag
                        ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    }`}
                  >
                    {tag}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
