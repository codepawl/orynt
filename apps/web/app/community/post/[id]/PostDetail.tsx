"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "app/lib/supabase/client";
import { vote, flagContent, deletePost } from "app/lib/community";
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

export function PostDetail({ post }: { post: CommunityPost }) {
  const router = useRouter();
  const [score, setScore] = useState(post.score);
  const [userVote, setUserVote] = useState(post.user_vote);
  const [isAuthor, setIsAuthor] = useState(false);

  useEffect(() => {
    // Restore vote state from localStorage
    const saved = localStorage.getItem(`vote:post:${post.id}`);
    if (saved) setUserVote(Number(saved));

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && user.id === post.author.id) setIsAuthor(true);
    });
  }, [post.author.id, post.id]);

  const getSession = async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  };

  const handleDelete = async () => {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    const session = await getSession();
    if (!session) return;
    try {
      await deletePost(session.access_token, post.id);
      router.push("/community");
    } catch {
      // silently fail
    }
  };

  const handleVote = async (value: number) => {
    const session = await getSession();
    if (!session) return;
    const newValue = userVote === value ? 0 : value;
    try {
      const result = await vote(session.access_token, {
        target_id: post.id,
        target_type: "post",
        value: newValue,
      });
      setScore(result.score);
      setUserVote(result.user_vote);
      if (result.user_vote !== 0) {
        localStorage.setItem(`vote:post:${post.id}`, String(result.user_vote));
      } else {
        localStorage.removeItem(`vote:post:${post.id}`);
      }
    } catch {
      // silently fail
    }
  };

  const handleFlag = async () => {
    const session = await getSession();
    if (!session) return;
    try {
      await flagContent(session.access_token, {
        target_id: post.id,
        target_type: "post",
      });
    } catch {
      // silently fail
    }
  };

  return (
    <div className="mb-8">
      <div className="flex gap-3">
        {/* Vote arrows — SVG triangles */}
        <div className="flex flex-col items-center gap-0.5 pt-1">
          <button
            onClick={() => handleVote(1)}
            className={`p-1 rounded transition-colors border-none bg-transparent cursor-pointer ${
              userVote === 1 ? "text-amber-500" : "text-neutral-400 hover:text-amber-500"
            }`}
          >
            <svg viewBox="0 0 12 8" className="w-4 h-3 fill-current">
              <path d="M6 0L12 8H0z" />
            </svg>
          </button>
          <span className="text-sm font-bold text-neutral-700 dark:text-neutral-300">
            {score}
          </span>
          <button
            onClick={() => handleVote(-1)}
            className={`p-1 rounded transition-colors border-none bg-transparent cursor-pointer ${
              userVote === -1 ? "text-blue-500" : "text-neutral-400 hover:text-blue-500"
            }`}
          >
            <svg viewBox="0 0 12 8" className="w-4 h-3 fill-current rotate-180">
              <path d="M6 0L12 8H0z" />
            </svg>
          </button>
        </div>

        <div className="flex-1">
          {/* Title */}
          <h1 className="text-xl font-bold mb-1 text-neutral-900 dark:text-neutral-100">
            {post.type === "show" && (
              <span className="text-amber-600 dark:text-amber-400 mr-1">Show CP:</span>
            )}
            {post.type === "link" && post.url ? (
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-inherit no-underline hover:underline"
              >
                {post.title}
              </a>
            ) : (
              post.title
            )}
          </h1>

          {/* Domain */}
          {post.type === "link" && post.url && getDomain(post.url) && (
            <p className="text-xs text-neutral-400 mb-2">
              ({getDomain(post.url)})
            </p>
          )}

          {/* Content */}
          {post.content && (
            <div className="prose prose-sm dark:prose-invert max-w-none mb-3 whitespace-pre-wrap">
              {post.content}
            </div>
          )}

          {/* Auto-post banner */}
          {post.is_auto && post.source_article_id && (
            <div className="mb-3 px-3 py-2 bg-neutral-50 dark:bg-neutral-800/50 rounded-md text-xs text-neutral-500 flex items-center gap-2">
              Auto-posted from news pipeline —{" "}
              <Link href="/news" className="underline text-inherit">
                View original on News
              </Link>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            {post.author.avatar_url && (
              <img
                src={post.author.avatar_url}
                alt=""
                className="w-4 h-4 rounded-full"
              />
            )}
            <Link
              href={`/profile/${post.author.username}`}
              className="hover:underline no-underline text-inherit"
            >
              {post.author.username}
            </Link>
            <span suppressHydrationWarning>{timeAgo(post.created_at)}</span>
            <button
              onClick={handleFlag}
              className="text-neutral-400 hover:text-red-500 transition-colors border-none bg-transparent cursor-pointer text-xs"
            >
              flag
            </button>
            {isAuthor && (
              <button
                onClick={handleDelete}
                className="text-neutral-400 hover:text-red-500 transition-colors border-none bg-transparent cursor-pointer text-xs"
              >
                delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
