"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "app/lib/supabase/client";
import { toast } from "../components/Toast";

interface CommunityPost {
  id: string;
  title: string;
  type: string;
  score: number;
  comment_count: number;
  is_auto: boolean;
  created_at: string;
  author_username?: string;
}

interface CommunityStats {
  total_posts: number;
  total_comments: number;
  flagged_items: number;
  posts_today: number;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-us", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const TYPE_BADGE: Record<string, string> = {
  link: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400",
  text: "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
  show: "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400",
};

export default function AdminCommunityPage() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayIso = today.toISOString();

        const [postsRes, commentsRes, flagsRes, todayRes, recentRes] = await Promise.all([
          supabase.from("posts").select("id", { count: "exact", head: true }),
          supabase.from("comments").select("id", { count: "exact", head: true }),
          supabase.from("flags").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("posts").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
          supabase
            .from("posts")
            .select("id, title, type, score, comment_count, is_auto, created_at, author:profiles!author_id(username)")
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

        setStats({
          total_posts: postsRes.count ?? 0,
          total_comments: commentsRes.count ?? 0,
          flagged_items: flagsRes.count ?? 0,
          posts_today: todayRes.count ?? 0,
        });

        const enriched: CommunityPost[] = (recentRes.data || []).map((p) => {
          const authorData = Array.isArray(p.author) ? p.author[0] : p.author;
          const author = authorData as { username?: string } | null;
          return {
            id: p.id,
            title: p.title,
            type: p.type,
            score: p.score,
            comment_count: p.comment_count,
            is_auto: p.is_auto,
            created_at: p.created_at,
            author_username: author?.username,
          };
        });
        setPosts(enriched);
      } catch {
        toast("Failed to load community data", "error");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Community
        </h1>
        <Link
          href="/admin/moderation"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors no-underline"
        >
          View Flagged Content →
        </Link>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Total Posts</p>
          <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {loading ? "—" : stats?.total_posts ?? 0}
          </p>
        </div>
        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Total Comments</p>
          <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {loading ? "—" : stats?.total_comments ?? 0}
          </p>
        </div>
        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Posts Today</p>
          <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {loading ? "—" : stats?.posts_today ?? 0}
          </p>
        </div>
        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Flagged Items</p>
          <p className={`text-2xl font-semibold ${
            (stats?.flagged_items ?? 0) > 0
              ? "text-orange-500"
              : "text-neutral-900 dark:text-neutral-100"
          }`}>
            {loading ? "—" : stats?.flagged_items ?? 0}
          </p>
        </div>
      </div>

      {/* Recent posts table */}
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
        Recent Posts
      </h2>
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Title</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-20">Type</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 hidden md:table-cell">Author</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-16">Score</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-16 hidden sm:table-cell">Comments</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-28 hidden lg:table-cell">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  Loading…
                </td>
              </tr>
            ) : posts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  No posts yet.
                </td>
              </tr>
            ) : (
              posts.map((post) => (
                <tr key={post.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/community/post/${post.id}`}
                      target="_blank"
                      className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline line-clamp-1 no-underline"
                    >
                      {post.title}
                    </Link>
                    {post.is_auto && (
                      <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                        auto
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TYPE_BADGE[post.type] ?? TYPE_BADGE.text}`}>
                      {post.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400 hidden md:table-cell">
                    {post.author_username ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400">
                    {post.score}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400 hidden sm:table-cell">
                    {post.comment_count}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400 hidden lg:table-cell whitespace-nowrap">
                    {formatDate(post.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
