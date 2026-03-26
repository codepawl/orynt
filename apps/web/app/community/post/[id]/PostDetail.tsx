"use client";

import { useState } from "react";
import Link from "next/link";
import { message } from "antd";
import {
  CaretUpFill,
  CaretDownFill,
  Clock,
  Flag,
  Link45deg,
  Newspaper,
} from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";
import { vote, flagContent } from "app/lib/community";
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

export function PostDetail({ post }: { post: CommunityPost }) {
  const [score, setScore] = useState(post.score);
  const [userVote, setUserVote] = useState(post.user_vote);

  const handleVote = async (value: number) => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      message.info("Sign in to vote");
      return;
    }
    const newValue = userVote === value ? 0 : value;
    try {
      const result = await vote(session.access_token, {
        target_id: post.id,
        target_type: "post",
        value: newValue,
      });
      setScore(result.score);
      setUserVote(result.user_vote);
    } catch {
      message.error("Vote failed");
    }
  };

  const handleFlag = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      message.info("Sign in to flag content");
      return;
    }
    try {
      await flagContent(session.access_token, {
        target_id: post.id,
        target_type: "post",
      });
      message.success("Flagged for review");
    } catch {
      message.error("Already flagged");
    }
  };

  return (
    <div className="mb-8">
      <div className="flex gap-3">
        <div className="flex flex-col items-center gap-0.5 pt-1">
          <button
            onClick={() => handleVote(1)}
            className={`p-1 rounded transition-colors border-none bg-transparent cursor-pointer ${
              userVote === 1
                ? "text-orange-500"
                : "text-neutral-400 hover:text-orange-500"
            }`}
          >
            <CaretUpFill className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-neutral-700 dark:text-neutral-300">
            {score}
          </span>
          <button
            onClick={() => handleVote(-1)}
            className={`p-1 rounded transition-colors border-none bg-transparent cursor-pointer ${
              userVote === -1
                ? "text-blue-500"
                : "text-neutral-400 hover:text-blue-500"
            }`}
          >
            <CaretDownFill className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1">
          <h1 className="text-xl font-bold mb-1">
            {post.type === "show" && (
              <span className="text-orange-600 dark:text-orange-400 mr-1">
                Show CP:
              </span>
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

          {post.type === "link" && post.url && (
            <p className="text-xs text-neutral-400 flex items-center gap-1 mb-2">
              <Link45deg className="w-3 h-3" />
              {new URL(post.url).hostname.replace("www.", "")}
            </p>
          )}

          {post.content && (
            <div className="prose prose-sm dark:prose-invert max-w-none mb-3 whitespace-pre-wrap">
              {post.content}
            </div>
          )}

          {post.is_auto && post.source_article_id && (
            <div className="mb-3 px-3 py-2 bg-neutral-50 dark:bg-neutral-800/50 rounded-md text-xs text-neutral-500 flex items-center gap-2">
              <Newspaper className="w-3.5 h-3.5" />
              Auto-posted from news pipeline —{" "}
              <Link href="/news" className="underline text-inherit">
                View original on News
              </Link>
            </div>
          )}

          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <Link
              href={`/profile/${post.author.username}`}
              className="hover:underline no-underline text-inherit"
            >
              {post.author.username}
            </Link>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(post.created_at)}
            </span>
            <button
              onClick={handleFlag}
              className="flex items-center gap-1 text-neutral-400 hover:text-red-500 transition-colors border-none bg-transparent cursor-pointer text-xs"
            >
              <Flag className="w-3 h-3" />
              flag
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
