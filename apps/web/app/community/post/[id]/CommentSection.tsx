"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Button, Input, message } from "antd";
import {
  CaretUpFill,
  CaretDownFill,
  ChatDots,
  ChevronDown,
  ChevronRight,
  Clock,
  Flag,
} from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";
import { createComment, vote, flagContent } from "app/lib/community";
import type { CommunityComment } from "@codepawl/shared";

const { TextArea } = Input;
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
        target_id: comment.id,
        target_type: "comment",
        value: newValue,
      });
      setScore(result.score);
      setUserVote(result.user_vote);
    } catch {
      message.error("Vote failed");
    }
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        message.info("Sign in to reply");
        return;
      }
      const newComment = await createComment(session.access_token, postId, {
        content: replyText.trim(),
        parent_id: comment.id,
      });
      onReply(newComment);
      setReplyText("");
      setShowReply(false);
      message.success("Reply posted");
    } catch {
      message.error("Failed to post reply");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFlag = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      message.info("Sign in to flag");
      return;
    }
    try {
      await flagContent(session.access_token, {
        target_id: comment.id,
        target_type: "comment",
      });
      message.success("Flagged for review");
    } catch {
      message.error("Already flagged");
    }
  };

  return (
    <div style={{ marginLeft: indent }}>
      <div className="py-2 border-l-2 border-neutral-200 dark:border-neutral-700 pl-3 mb-1">
        <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="border-none bg-transparent cursor-pointer p-0 text-neutral-400"
          >
            {collapsed ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          <Link
            href={`/profile/${comment.author.username}`}
            className="font-medium hover:underline no-underline text-inherit"
          >
            {comment.author.username}
          </Link>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {timeAgo(comment.created_at)}
          </span>
          <span className="flex items-center gap-1">
            <button
              onClick={() => handleVote(1)}
              className={`border-none bg-transparent cursor-pointer p-0 ${
                userVote === 1 ? "text-orange-500" : "text-neutral-400 hover:text-orange-500"
              }`}
            >
              <CaretUpFill className="w-3 h-3" />
            </button>
            <span>{score}</span>
            <button
              onClick={() => handleVote(-1)}
              className={`border-none bg-transparent cursor-pointer p-0 ${
                userVote === -1 ? "text-blue-500" : "text-neutral-400 hover:text-blue-500"
              }`}
            >
              <CaretDownFill className="w-3 h-3" />
            </button>
          </span>
        </div>

        {!collapsed && (
          <>
            <div className="text-sm whitespace-pre-wrap mb-1">
              {comment.content}
            </div>
            <div className="flex gap-3 text-xs text-neutral-400">
              <button
                onClick={() => setShowReply(!showReply)}
                className="flex items-center gap-1 border-none bg-transparent cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300 text-xs text-neutral-400"
              >
                <ChatDots className="w-3 h-3" />
                reply
              </button>
              <button
                onClick={handleFlag}
                className="flex items-center gap-1 border-none bg-transparent cursor-pointer hover:text-red-500 text-xs text-neutral-400"
              >
                <Flag className="w-3 h-3" />
                flag
              </button>
            </div>

            {showReply && (
              <div className="mt-2 space-y-2">
                <TextArea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write a reply..."
                  maxLength={10000}
                />
                <div className="flex gap-2">
                  <Button
                    size="small"
                    type="primary"
                    loading={submitting}
                    onClick={handleReply}
                  >
                    Reply
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setShowReply(false);
                      setReplyText("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

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

  const tree = buildTree(comments);

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
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        message.info("Sign in to comment");
        return;
      }
      const comment = await createComment(session.access_token, postId, {
        content: newComment.trim(),
      });
      handleAddComment(comment);
      setNewComment("");
      message.success("Comment posted");
    } catch {
      message.error("Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">
        {comments.length} Comment{comments.length !== 1 ? "s" : ""}
      </h2>

      <div className="mb-6 space-y-2">
        <TextArea
          rows={4}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          maxLength={10000}
        />
        <Button
          type="primary"
          loading={submitting}
          onClick={handleSubmitTopLevel}
        >
          Comment
        </Button>
      </div>

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
    </div>
  );
}
