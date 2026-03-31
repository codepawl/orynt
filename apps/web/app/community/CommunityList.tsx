"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "app/lib/supabase/client";
import { vote } from "app/lib/community";
import type { CommunityPost } from "@codepawl/shared";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

function VoteButton({ post }: { post: CommunityPost }) {
  const router = useRouter();
  const [score, setScore] = useState(post.score);
  const [voted, setVoted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(`vote:post:${post.id}`);
    if (saved === "1") setVoted(true);
  }, [post.id]);

  // Auto-dismiss error
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 3000);
    return () => clearTimeout(t);
  }, [error]);

  const handleVote = async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.push(`/login?redirect=/community`);
      return;
    }

    // Optimistic update
    const prevVoted = voted;
    const prevScore = score;
    const newValue = voted ? 0 : 1;
    setVoted(newValue === 1);
    setScore(prev => prev + (newValue === 1 ? 1 : -1));

    try {
      const result = await vote(session.access_token, {
        target_id: post.id,
        target_type: "post",
        value: newValue,
      });
      setScore(result.score);
      setVoted(newValue === 1);
      if (newValue === 1) {
        localStorage.setItem(`vote:post:${post.id}`, "1");
      } else {
        localStorage.removeItem(`vote:post:${post.id}`);
      }
    } catch {
      // Revert optimistic update
      setVoted(prevVoted);
      setScore(prevScore);
      setError("Vote failed");
    }
  };

  return (
    <div className="flex flex-col items-center min-w-[2rem] pt-1">
      <button
        onClick={handleVote}
        className={`flex flex-col items-center border-none bg-transparent cursor-pointer ${
          voted
            ? "text-amber-500"
            : "text-neutral-400 hover:text-amber-500"
        } transition-colors`}
      >
        <svg viewBox="0 0 12 8" className="w-3 h-2 fill-current">
          <path d="M6 0L12 8H0z" />
        </svg>
        <span className="text-xs font-medium mt-0.5">{score}</span>
      </button>
      {error && (
        <span className="text-[10px] text-red-500 mt-0.5">{error}</span>
      )}
    </div>
  );
}

interface Props {
  posts: CommunityPost[];
  total: number;
  page: number;
  totalPages: number;
  sort: string;
  type?: string;
}

export function CommunityList({
  posts,
  total,
  page,
  totalPages,
  sort,
  type,
}: Props) {
  const router = useRouter();

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams({ page: String(newPage), sort });
    if (type) params.set("type", type);
    router.push(`/community?${params}`);
  };

  return (
    <div>
      <ol className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {posts.map((post, i) => (
          <li
            key={post.id}
            className="flex items-start gap-2 py-2"
          >
            <span className="text-xs text-neutral-400 dark:text-neutral-500 min-w-[1.5rem] pt-1 text-right">
              {(page - 1) * 20 + i + 1}.
            </span>
            <VoteButton post={post} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <Link
                  href={
                    post.type === "link" && post.url
                      ? post.url
                      : `/community/post/${post.id}`
                  }
                  className="text-sm font-medium text-neutral-900 dark:text-neutral-100 no-underline hover:underline"
                  {...(post.type === "link"
                    ? { target: "_blank", rel: "noopener" }
                    : {})}
                >
                  {post.type === "show" && (
                    <span className="text-amber-600 dark:text-amber-400 mr-1">
                      Show CP:
                    </span>
                  )}
                  {post.title}
                </Link>
                {post.type === "link" && post.url && getDomain(post.url) && (
                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                    ({getDomain(post.url)})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                <span>{post.score} point{post.score !== 1 ? "s" : ""}</span>
                <span>by{" "}
                  <Link
                    href={`/profile/${post.author.username}`}
                    className="hover:underline no-underline text-inherit"
                  >
                    {post.author.username}
                  </Link>
                </span>
                <span suppressHydrationWarning>{timeAgo(post.created_at)}</span>
                <Link
                  href={`/community/post/${post.id}`}
                  className="hover:underline no-underline text-inherit"
                >
                  {post.comment_count} comment{post.comment_count !== 1 ? "s" : ""}
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6 text-sm">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors bg-transparent cursor-pointer"
          >
            Prev
          </button>
          <span className="text-neutral-500 dark:text-neutral-400 text-xs">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors bg-transparent cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
