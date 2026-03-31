"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash, Ban } from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";
import { adminDeletePost, adminDeleteComment, adminBanUser } from "../lib/api";
import { toast } from "../components/Toast";
import { ConfirmModal } from "../components/ConfirmModal";

interface CommunityPost {
  id: string;
  title: string;
  type: string;
  score: number;
  comment_count: number;
  is_auto: boolean;
  created_at: string;
  author_id: string;
  author_username?: string;
}

interface CommunityComment {
  id: string;
  post_id: string;
  content: string;
  score: number;
  created_at: string;
  author_id: string;
  author_username?: string;
}

interface CommunityStats {
  total_posts: number;
  total_comments: number;
  flagged_items: number;
  posts_today: number;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-us", { month: "short", day: "numeric", year: "numeric" });
}

const TYPE_BADGE: Record<string, string> = {
  link: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400",
  text: "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
  show: "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400",
};

type Tab = "posts" | "comments";

export default function AdminCommunityPage() {
  const [tab, setTab] = useState<Tab>("posts");
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDeletePost, setConfirmDeletePost] = useState<string | null>(null);
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<{ userId: string; username: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      const [postsRes, commentsRes, flagsRes, todayRes, recentPostsRes, recentCommentsRes] =
        await Promise.all([
          supabase.from("posts").select("id", { count: "exact", head: true }),
          supabase.from("comments").select("id", { count: "exact", head: true }),
          supabase.from("flags").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("posts").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
          supabase
            .from("posts")
            .select("id, title, type, score, comment_count, is_auto, created_at, author_id, author:profiles!author_id(username)")
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("comments")
            .select("id, post_id, content, score, created_at, author_id, author:profiles!author_id(username)")
            .order("created_at", { ascending: false })
            .limit(50),
        ]);

      setStats({
        total_posts: postsRes.count ?? 0,
        total_comments: commentsRes.count ?? 0,
        flagged_items: flagsRes.count ?? 0,
        posts_today: todayRes.count ?? 0,
      });

      setPosts(
        (recentPostsRes.data || []).map((p) => {
          const a = Array.isArray(p.author) ? p.author[0] : p.author;
          return { ...p, author_username: (a as { username?: string } | null)?.username };
        })
      );

      setComments(
        (recentCommentsRes.data || []).map((c) => {
          const a = Array.isArray(c.author) ? c.author[0] : c.author;
          return { ...c, author_username: (a as { username?: string } | null)?.username };
        })
      );
    } catch {
      toast("Failed to load community data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDeletePost = async (id: string) => {
    try {
      await adminDeletePost(id);
      toast("Post deleted");
      setConfirmDeletePost(null);
      load();
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    }
  };

  const handleDeleteComment = async (id: string) => {
    try {
      await adminDeleteComment(id);
      toast("Comment deleted");
      setConfirmDeleteComment(null);
      load();
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    }
  };

  const handleBan = async (userId: string) => {
    try {
      await adminBanUser(userId);
      toast("User banned");
      setConfirmBan(null);
      load();
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div>
      {confirmDeletePost && (
        <ConfirmModal
          title="Delete post?"
          message="This will permanently delete the post and all its comments."
          onConfirm={() => handleDeletePost(confirmDeletePost)}
          onCancel={() => setConfirmDeletePost(null)}
        />
      )}
      {confirmDeleteComment && (
        <ConfirmModal
          title="Delete comment?"
          message="This will permanently delete the comment."
          onConfirm={() => handleDeleteComment(confirmDeleteComment)}
          onCancel={() => setConfirmDeleteComment(null)}
        />
      )}
      {confirmBan && (
        <ConfirmModal
          title={`Ban ${confirmBan.username}?`}
          message="This will set the user's role to 'banned' and prevent them from posting or commenting."
          confirmLabel="Ban User"
          onConfirm={() => handleBan(confirmBan.userId)}
          onCancel={() => setConfirmBan(null)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Community</h1>
        <Link
          href="/admin/moderation"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors no-underline"
        >
          View Flagged →
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Posts", value: stats?.total_posts ?? 0 },
          { label: "Total Comments", value: stats?.total_comments ?? 0 },
          { label: "Posts Today", value: stats?.posts_today ?? 0 },
          { label: "Flagged Items", value: stats?.flagged_items ?? 0, warn: true },
        ].map(({ label, value, warn }) => (
          <div key={label} className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">{label}</p>
            <p className={`text-2xl font-semibold ${warn && value > 0 ? "text-orange-500" : "text-neutral-900 dark:text-neutral-100"}`}>
              {loading ? "—" : value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {(["posts", "comments"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded-full border transition-colors capitalize ${
              tab === t
                ? "border-neutral-900 dark:border-neutral-100 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                : "border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Posts table */}
      {tab === "posts" && (
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
                <th className="px-4 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">Loading…</td></tr>
              ) : posts.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">No posts yet.</td></tr>
              ) : posts.map((post) => (
                <tr key={post.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/community/post/${post.id}`}
                      target="_blank"
                      className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline line-clamp-1 no-underline"
                    >
                      {post.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TYPE_BADGE[post.type] ?? TYPE_BADGE.text}`}>
                      {post.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400 hidden md:table-cell">
                    {post.author_username ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400">{post.score}</td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400 hidden sm:table-cell">{post.comment_count}</td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400 hidden lg:table-cell whitespace-nowrap">
                    {formatDate(post.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      {post.author_id && post.author_username && (
                        <button
                          onClick={() => setConfirmBan({ userId: post.author_id, username: post.author_username! })}
                          className="p-1 text-neutral-400 hover:text-orange-500 transition-colors"
                          title="Ban author"
                        >
                          <Ban size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDeletePost(post.id)}
                        className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                        title="Delete post"
                      >
                        <Trash size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Comments table */}
      {tab === "comments" && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Content</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 hidden md:table-cell">Author</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-16">Score</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-28 hidden lg:table-cell">Date</th>
                <th className="px-4 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">Loading…</td></tr>
              ) : comments.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">No comments yet.</td></tr>
              ) : comments.map((comment) => (
                <tr key={comment.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/community/post/${comment.post_id}`}
                      target="_blank"
                      className="text-neutral-900 dark:text-neutral-100 hover:underline line-clamp-2 no-underline"
                    >
                      {comment.content}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400 hidden md:table-cell">
                    {comment.author_username ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400">{comment.score}</td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400 hidden lg:table-cell whitespace-nowrap">
                    {formatDate(comment.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      {comment.author_id && comment.author_username && (
                        <button
                          onClick={() => setConfirmBan({ userId: comment.author_id, username: comment.author_username! })}
                          className="p-1 text-neutral-400 hover:text-orange-500 transition-colors"
                          title="Ban author"
                        >
                          <Ban size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDeleteComment(comment.id)}
                        className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                        title="Delete comment"
                      >
                        <Trash size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
