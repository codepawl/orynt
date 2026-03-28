"use client";

import { useState, useCallback, useEffect, createContext, useContext } from "react";
import Link from "next/link";
import { createClient } from "app/lib/supabase/client";
import { createComment, vote, flagContent, fetchMyVotes } from "app/lib/community";
import type { CommunityComment } from "@codepawl/shared";

/** Context to pass down fetched comment vote states */
const CommentVoteContext = createContext<Record<string, number>>({});

const MAX_VISUAL_DEPTH = 5;

interface CommentNode extends CommunityComment {
  children: CommentNode[];
}

function buildTree(comments: CommunityComment[]): CommentNode[] {
  const map = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  for (const c of comments) {
    map.set(c.id, { ...c, children: [] });
  }

  for (const c of comments) {
    const node = map.get(c.id)!;
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

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

async function getSession() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

function CommentItem({
  comment,
  depth,
  postId,
  onReply,
}: {
  comment: CommentNode;
  depth: number;
  postId: string;
  onReply: (comment: CommunityComment) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState(comment.score);
  const [userVote, setUserVote] = useState(comment.user_vote);

  const visualDepth = Math.min(depth, MAX_VISUAL_DEPTH);
  const indent = visualDepth * 24;

  const serverVotes = useContext(CommentVoteContext);

  useEffect(() => {
    // Prefer server-fetched vote, fall back to localStorage
    if (serverVotes[comment.id] !== undefined) {
      setUserVote(serverVotes[comment.id]);
    } else {
      const saved = localStorage.getItem(`vote:comment:${comment.id}`);
      if (saved) setUserVote(Number(saved));
    }
  }, [comment.id, serverVotes]);

  const handleVote = async (value: number) => {
    const session = await getSession();
    if (!session) return;
    const newValue = userVote === value ? 0 : value;
    try {
      const result = await vote(session.access_token, {
        target_id: comment.id,
        target_type: "comment",
        value: newValue,
      });
      setScore(result.score);
      setUserVote(result.user_vote);
      if (result.user_vote !== 0) {
        localStorage.setItem(`vote:comment:${comment.id}`, String(result.user_vote));
      } else {
        localStorage.removeItem(`vote:comment:${comment.id}`);
      }
    } catch {
      // silently fail
    }
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      const session = await getSession();
      if (!session) return;
      const newComment = await createComment(session.access_token, postId, {
        content: replyText.trim(),
        parent_id: comment.id,
      });
      onReply(newComment);
      setReplyText("");
      setShowReply(false);
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  const handleFlag = async () => {
    const session = await getSession();
    if (!session) return;
    try {
      await flagContent(session.access_token, {
        target_id: comment.id,
        target_type: "comment",
      });
    } catch {
      // silently fail
    }
  };

  return (
    <div style={{ marginLeft: indent }}>
      <div className="py-2 border-l-2 border-neutral-200 dark:border-neutral-700 pl-3 mb-1">
        {/* Header */}
        <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="border-none bg-transparent cursor-pointer p-0 text-neutral-400 text-xs"
          >
            {collapsed ? "[+]" : "[-]"}
          </button>
          <Link
            href={`/profile/${comment.author.username}`}
            className="font-medium hover:underline no-underline text-inherit"
          >
            {comment.author.username}
          </Link>
          <span suppressHydrationWarning>{timeAgo(comment.created_at)}</span>
          <span className="flex items-center gap-1">
            <button
              onClick={() => handleVote(1)}
              className={`border-none bg-transparent cursor-pointer p-0 text-xs ${
                userVote === 1 ? "text-amber-500" : "text-neutral-400 hover:text-amber-500"
              }`}
            >
              ▲
            </button>
            <span>{score}</span>
            <button
              onClick={() => handleVote(-1)}
              className={`border-none bg-transparent cursor-pointer p-0 text-xs ${
                userVote === -1 ? "text-blue-500" : "text-neutral-400 hover:text-blue-500"
              }`}
            >
              ▼
            </button>
          </span>
        </div>

        {!collapsed && (
          <>
            {/* Content */}
            <div className="text-sm whitespace-pre-wrap mb-1 text-neutral-800 dark:text-neutral-200">
              {comment.content}
            </div>

            {/* Actions */}
            <div className="flex gap-3 text-xs text-neutral-400">
              <button
                onClick={() => setShowReply(!showReply)}
                className="border-none bg-transparent cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300 text-xs text-neutral-400"
              >
                reply
              </button>
              <button
                onClick={handleFlag}
                className="border-none bg-transparent cursor-pointer hover:text-red-500 text-xs text-neutral-400"
              >
                flag
              </button>
            </div>

            {/* Reply form */}
            {showReply && (
              <div className="mt-2 space-y-2">
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write a reply..."
                  maxLength={10000}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 text-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent resize-y"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleReply}
                    disabled={submitting}
                    className="px-3 py-1 text-xs font-medium rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-80 disabled:opacity-50 cursor-pointer border-none"
                  >
                    {submitting ? "..." : "Reply"}
                  </button>
                  <button
                    onClick={() => {
                      setShowReply(false);
                      setReplyText("");
                    }}
                    className="px-3 py-1 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer bg-transparent"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Children */}
            {comment.children.map((child) => (
              <CommentItem
                key={child.id}
                comment={child}
                depth={depth + 1}
                postId={postId}
                onReply={onReply}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

interface Props {
  postId: string;
  initialComments: CommunityComment[];
}

export function CommentSection({ postId, initialComments }: Props) {
  const [comments, setComments] = useState(initialComments);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [myVotes, setMyVotes] = useState<Record<string, number>>({});

  const tree = buildTree(comments);

  // Fetch user's comment votes on mount
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session || !comments.length) return;
      const ids = comments.map((c) => c.id);
      const votes = await fetchMyVotes(session.access_token, "comment", ids);
      setMyVotes(votes);
    });
  }, [comments]);

  const handleAddComment = useCallback(
    (comment: CommunityComment) => {
      setComments((prev) => [...prev, comment]);
    },
    []
  );

  const handleSubmitTopLevel = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const session = await getSession();
      if (!session) return;
      const comment = await createComment(session.access_token, postId, {
        content: newComment.trim(),
      });
      handleAddComment(comment);
      setNewComment("");
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-4 text-neutral-900 dark:text-neutral-100">
        {comments.length} Comment{comments.length !== 1 ? "s" : ""}
      </h2>

      {/* Top-level comment form */}
      <div className="mb-6 space-y-2">
        <textarea
          rows={4}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          maxLength={10000}
          className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 text-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent resize-y"
        />
        <button
          onClick={handleSubmitTopLevel}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-80 disabled:opacity-50 cursor-pointer border-none"
        >
          {submitting ? "Posting..." : "Comment"}
        </button>
      </div>

      {/* Thread */}
      <CommentVoteContext.Provider value={myVotes}>
      <div>
        {tree.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            depth={0}
            postId={postId}
            onReply={handleAddComment}
          />
        ))}
      </div>
      </CommentVoteContext.Provider>
    </div>
  );
}
