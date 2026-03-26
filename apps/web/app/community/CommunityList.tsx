"use client";

import { useState } from "react";
import Link from "next/link";
import { Pagination, message } from "antd";
import { useRouter } from "next/navigation";
import {
  CaretUpFill,
  ChatDots,
  Clock,
  Link45deg,
} from "react-bootstrap-icons";
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
    return url;
  }
}

interface Props {
  posts: CommunityPost[];
  total: number;
  page: number;
  totalPages: number;
  sort: string;
  type?: string;
}

function VoteButton({ post }: { post: CommunityPost }) {
  const [score, setScore] = useState(post.score);
  const [voted, setVoted] = useState(false);

  const handleVote = async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      message.info("Sign in to vote");
      return;
    }
    const newValue = voted ? 0 : 1;
    try {
      const result = await vote(session.access_token, {
        target_id: post.id,
        target_type: "post",
        value: newValue,
      });
      setScore(result.score);
      setVoted(newValue === 1);
    } catch {
      message.error("Vote failed");
    }
  };

  return (
    <div className="flex flex-col items-center min-w-[2rem] pt-0.5">
      <button
        onClick={handleVote}
        className={`border-none bg-transparent cursor-pointer p-0 transition-colors ${
          voted ? "text-orange-500" : "text-neutral-400 hover:text-orange-500"
        }`}
      >
        <CaretUpFill className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
        {score}
      </span>
    </div>
  );
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
      <ul className="space-y-1">
        {posts.map((post) => (
          <li
            key={post.id}
            className="flex items-start gap-3 py-3 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
          >
            <VoteButton post={post} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <Link
                  href={
                    post.type === "link" && post.url
                      ? post.url
                      : `/community/post/${post.id}`
                  }
                  className="text-base font-medium text-neutral-900 dark:text-neutral-100 no-underline hover:underline"
                  {...(post.type === "link" ? { target: "_blank", rel: "noopener" } : {})}
                >
                  {post.type === "show" && (
                    <span className="text-orange-600 dark:text-orange-400 mr-1">
                      Show CP:
                    </span>
                  )}
                  {post.title}
                </Link>
                {post.type === "link" && post.url && (
                  <span className="text-xs text-neutral-400 flex items-center gap-1 shrink-0">
                    <Link45deg className="w-3 h-3" />
                    {getDomain(post.url)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500 dark:text-neutral-400">
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
                <Link
                  href={`/community/post/${post.id}`}
                  className="flex items-center gap-1 hover:underline no-underline text-inherit"
                >
                  <ChatDots className="w-3 h-3" />
                  {post.comment_count} comment{post.comment_count !== 1 ? "s" : ""}
                </Link>
              </div>
              {post.tags && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {post.tags.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => (
                    <Link
                      key={tag}
                      href={`/community?tag=${encodeURIComponent(tag)}`}
                      className="px-1.5 py-0.5 text-[10px] bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 rounded no-underline hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="flex justify-center mt-6">
          <Pagination
            current={page}
            total={total}
            pageSize={20}
            onChange={handlePageChange}
            showSizeChanger={false}
          />
        </div>
      )}
    </div>
  );
}
