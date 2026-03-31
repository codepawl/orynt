"use client";

import { useEffect, useState } from "react";
import { createClient } from "app/lib/supabase/client";
import { toast } from "../components/Toast";

interface FlagItem {
  id: string;
  reporter_id: string;
  target_id: string;
  target_type: "post" | "comment";
  reason: string | null;
  status: string;
  created_at: string;
  reporter_username?: string;
  target_title?: string;
  target_content?: string;
  target_author?: string;
}

export default function ModerationPage() {
  const [flags, setFlags] = useState<FlagItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFlags = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("flags")
        .select(`*, reporter:profiles!reporter_id(username)`)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Collect post and comment IDs to batch-fetch
      const postIds = (data || [])
        .filter((f) => f.target_type === "post")
        .map((f) => f.target_id);
      const commentIds = (data || [])
        .filter((f) => f.target_type === "comment")
        .map((f) => f.target_id);

      const [postsResult, commentsResult] = await Promise.all([
        postIds.length > 0
          ? supabase
              .from("posts")
              .select("id, title, author:profiles!author_id(username)")
              .in("id", postIds)
          : { data: [] },
        commentIds.length > 0
          ? supabase
              .from("comments")
              .select("id, content, author:profiles!author_id(username)")
              .in("id", commentIds)
          : { data: [] },
      ]);

      const postMap = new Map<string, { title: string; author_username?: string }>();
      for (const p of postsResult.data || []) {
        const authorData = Array.isArray(p.author) ? p.author[0] : p.author;
        const author = authorData as { username?: string } | null;
        postMap.set(p.id, { title: p.title, author_username: author?.username });
      }

      const commentMap = new Map<string, { content: string; author_username?: string }>();
      for (const c of commentsResult.data || []) {
        const authorData = Array.isArray(c.author) ? c.author[0] : c.author;
        const author = authorData as { username?: string } | null;
        commentMap.set(c.id, {
          content: c.content?.substring(0, 100),
          author_username: author?.username,
        });
      }

      const enriched: FlagItem[] = [];
      for (const flag of data || []) {
        const reporterData = Array.isArray(flag.reporter) ? flag.reporter[0] : flag.reporter;
        const reporter = reporterData as { username?: string } | null;
        const item: FlagItem = { ...flag, reporter_username: reporter?.username };

        if (flag.target_type === "post") {
          const p = postMap.get(flag.target_id);
          if (p) {
            item.target_title = p.title;
            item.target_author = p.author_username;
          }
        } else {
          const c = commentMap.get(flag.target_id);
          if (c) {
            item.target_content = c.content;
            item.target_author = c.author_username;
          }
        }
        enriched.push(item);
      }

      setFlags(enriched);
    } catch {
      toast("Failed to load flags", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, []);

  const handleAction = async (flagId: string, action: "remove" | "dismiss") => {
    const flag = flags.find((f) => f.id === flagId);
    if (!flag) return;

    if (
      action === "remove" &&
      !window.confirm(`Remove this ${flag.target_type}? This cannot be undone.`)
    ) {
      return;
    }

    try {
      const supabase = createClient();

      if (action === "remove") {
        const table = flag.target_type === "post" ? "posts" : "comments";
        await supabase.from(table).delete().eq("id", flag.target_id);
        toast(`${flag.target_type} removed`);
      }

      await supabase
        .from("flags")
        .update({ status: action === "remove" ? "reviewed" : "dismissed" })
        .eq("id", flagId);

      setFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch {
      toast("Action failed", "error");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Moderation
        </h1>
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
          {flags.length} pending
        </span>
      </div>

      <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-neutral-100 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-16">
                    Type
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Content
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-28">
                    Author
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-28">
                    Reported by
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-28">
                    Reason
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-28">
                    Date
                  </th>
                  <th className="px-4 py-2.5 w-32" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {flags.map((flag) => (
                  <tr
                    key={flag.id}
                    className="bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          flag.target_type === "post"
                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                            : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                        }`}
                      >
                        {flag.target_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-900 dark:text-neutral-100 max-w-[200px] truncate">
                      {flag.target_title || flag.target_content || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400">
                      {flag.target_author || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400">
                      {flag.reporter_username || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400">
                      {flag.reason || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400">
                      {new Date(flag.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction(flag.id, "remove")}
                          className="px-2.5 py-1 text-xs font-medium border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          Remove
                        </button>
                        <button
                          onClick={() => handleAction(flag.id, "dismiss")}
                          className="px-2.5 py-1 text-xs font-medium border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {flags.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500"
                    >
                      No flagged content
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
