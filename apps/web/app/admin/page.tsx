"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ExclamationTriangle,
  JournalText,
  ChatLeft,
  People,
  Flag,
} from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";
import { toast } from "./components/Toast";

interface BlogStats {
  total: number;
  pending_review: number;
}

interface CommunityStats {
  total_posts: number;
  total_comments: number;
  flagged: number;
}

export default function AdminDashboard() {
  const [blogStats, setBlogStats] = useState<BlogStats | null>(null);
  const [communityStats, setCommunityStats] = useState<CommunityStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      const [blogRes, blogReviewRes, postsRes, commentsRes, flagsRes] =
        await Promise.allSettled([
          supabase.from("blog_posts").select("id", { count: "exact", head: true }),
          supabase
            .from("blog_posts")
            .select("id", { count: "exact", head: true })
            .eq("status", "review"),
          supabase.from("posts").select("id", { count: "exact", head: true }),
          supabase.from("comments").select("id", { count: "exact", head: true }),
          supabase
            .from("flags")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
        ]);

      setBlogStats({
        total: blogRes.status === "fulfilled" ? (blogRes.value.count ?? 0) : 0,
        pending_review:
          blogReviewRes.status === "fulfilled" ? (blogReviewRes.value.count ?? 0) : 0,
      });

      setCommunityStats({
        total_posts: postsRes.status === "fulfilled" ? (postsRes.value.count ?? 0) : 0,
        total_comments:
          commentsRes.status === "fulfilled" ? (commentsRes.value.count ?? 0) : 0,
        flagged: flagsRes.status === "fulfilled" ? (flagsRes.value.count ?? 0) : 0,
      });
    } catch (err: unknown) {
      toast((err as Error).message ?? "Failed to load dashboard", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-neutral-100 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Dashboard
        </h1>
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-2">
        Blog
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Blog Posts"
          value={blogStats?.total ?? 0}
          icon={<JournalText size={16} />}
          href="/admin/blog"
        />
        <StatCard
          title="Pending Review"
          value={blogStats?.pending_review ?? 0}
          icon={<ExclamationTriangle size={16} />}
          valueClass={(blogStats?.pending_review ?? 0) > 0 ? "text-yellow-500" : ""}
          href="/admin/blog"
        />
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-2">
        Community
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Posts"
          value={communityStats?.total_posts ?? 0}
          icon={<People size={16} />}
          href="/admin/community"
        />
        <StatCard
          title="Total Comments"
          value={communityStats?.total_comments ?? 0}
          icon={<ChatLeft size={16} />}
        />
        <StatCard
          title="Flagged Items"
          value={communityStats?.flagged ?? 0}
          icon={<Flag size={16} />}
          valueClass={(communityStats?.flagged ?? 0) > 0 ? "text-orange-500" : ""}
          href="/admin/moderation"
        />
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  valueClass = "",
  href,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  valueClass?: string;
  href?: string;
}) {
  const inner = (
    <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 h-full">
      <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 text-xs mb-2">
        {icon}
        {title}
      </div>
      <div
        className={`text-2xl font-semibold ${
          valueClass || "text-neutral-900 dark:text-neutral-100"
        }`}
      >
        {value}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="no-underline hover:opacity-80 transition-opacity">
        {inner}
      </Link>
    );
  }
  return inner;
}
