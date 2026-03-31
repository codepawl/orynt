"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileEarmarkText,
  Rss,
  CheckCircle,
  ExclamationTriangle,
} from "react-bootstrap-icons";
import { getDashboard, triggerCollectAll } from "./lib/api";
import type { Article, DashboardStats } from "./lib/types";
import { toast } from "./components/Toast";
import { StatusBadge } from "./components/StatusBadge";

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);

  const loadData = () => {
    getDashboard()
      .then((data) => {
        setStats(data.stats);
        setRecent(data.recent);
      })
      .catch((err) => toast(err.message, "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      const result = await triggerCollectAll();
      toast(
        `Collected ${result.new_articles} new articles from ${result.feeds_processed} feeds`
      );
      loadData();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setCollecting(false);
    }
  };

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
        <button
          onClick={handleCollect}
          disabled={collecting}
          className="px-4 py-2 text-sm font-medium bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-300 disabled:opacity-50 transition-colors"
        >
          {collecting ? "Collecting…" : "Collect Now"}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Articles"
          value={stats?.total_articles ?? 0}
          icon={<FileEarmarkText size={16} />}
        />
        <StatCard
          title="Pending Review"
          value={(stats?.draft_count ?? 0) + (stats?.review_count ?? 0)}
          icon={<ExclamationTriangle size={16} />}
          valueClass="text-yellow-500"
        />
        <StatCard
          title="Published"
          value={stats?.published_count ?? 0}
          icon={<CheckCircle size={16} />}
          valueClass="text-green-500"
        />
        <StatCard
          title="Active Feeds"
          value={stats?.active_feeds ?? 0}
          icon={<Rss size={16} />}
        />
      </div>

      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
        Recent Articles
      </h2>
      <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Title
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-24">
                Status
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Tags
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-28">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {recent.map((a) => (
              <tr key={a.id} className="bg-white dark:bg-neutral-950">
                <td className="px-4 py-2.5 max-w-0">
                  <Link
                    href={`/admin/articles/${a.id}`}
                    className="text-neutral-900 dark:text-neutral-100 hover:underline truncate block"
                  >
                    {a.title || a.original_title}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={a.status} />
                </td>
                <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400 truncate max-w-[200px]">
                  {a.tags || "—"}
                </td>
                <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400">
                  {new Date(a.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500"
                >
                  No articles yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  valueClass = "",
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
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
}
