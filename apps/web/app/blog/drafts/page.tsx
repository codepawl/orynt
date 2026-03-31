"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "app/lib/supabase/client";
import { fetchMyPosts } from "app/lib/blog";
import type { BlogPost } from "@codepawl/shared";

function statusBadge(status: BlogPost["status"]) {
  const classes =
    status === "published"
      ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
      : status === "review"
      ? "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400";
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${classes}`}>
      {status}
    </span>
  );
}

export default function DraftsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login?redirect=/blog/drafts");
        return;
      }
      try {
        const list = await fetchMyPosts(session.access_token);
        setPosts(list?.posts ?? []);
      } finally {
        setLoading(false);
      }
    });
  }, [router]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto w-full py-8 px-4">
        <div className="h-8 w-40 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg border border-neutral-200 dark:border-neutral-800 animate-pulse bg-neutral-50 dark:bg-neutral-900" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          My posts
        </h1>
        <Link
          href="/blog/write"
          className="px-4 py-2 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 transition-opacity"
        >
          Write new post
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-16 text-neutral-500 dark:text-neutral-400 text-sm">
          No posts yet.{" "}
          <Link href="/blog/write" className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100">
            Write your first post.
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="flex items-start justify-between gap-4 px-4 py-3.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {statusBadge(post.status)}
                  {post.reading_time_minutes && (
                    <span className="text-xs text-neutral-400">
                      {post.reading_time_minutes} min read
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                  {post.title}
                </p>
                {post.summary && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                    {post.summary}
                  </p>
                )}
                <p className="text-xs text-neutral-400 mt-1">
                  Updated {new Date(post.updated_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {post.status === "published" && (
                  <Link
                    href={`/blog/${post.slug}`}
                    className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 underline underline-offset-2"
                  >
                    View
                  </Link>
                )}
                {post.status !== "review" && (
                  <Link
                    href={`/blog/edit/${post.id}`}
                    className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 underline underline-offset-2"
                  >
                    Edit
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
