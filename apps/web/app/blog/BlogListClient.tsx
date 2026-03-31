"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Grid3x3GapFill, ListUl } from "react-bootstrap-icons";
import { ContentCard } from "../components/ui/ContentCard";

interface BlogPost {
  slug: string;
  metadata: {
    title: string;
    publishedAt: string;
    summary?: string;
    image?: string;
  };
}

interface BlogListClientProps {
  posts: BlogPost[];
}

function formatDate(date: string, includeRelative = false) {
  const currentDate = new Date();
  if (!date.includes("T")) {
    date = `${date}T00:00:00`;
  }
  const targetDate = new Date(date);

  const yearsAgo = currentDate.getFullYear() - targetDate.getFullYear();
  const monthsAgo = currentDate.getMonth() - targetDate.getMonth();
  const daysAgo = currentDate.getDate() - targetDate.getDate();

  let formattedDate = "";

  if (yearsAgo > 0) {
    formattedDate = `${yearsAgo}y ago`;
  } else if (monthsAgo > 0) {
    formattedDate = `${monthsAgo}mo ago`;
  } else if (daysAgo > 0) {
    formattedDate = `${daysAgo}d ago`;
  } else {
    formattedDate = "Today";
  }

  const fullDate = targetDate.toLocaleString("en-us", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (!includeRelative) {
    return fullDate;
  }

  return `${fullDate} (${formattedDate})`;
}

export function BlogListClient({ posts }: BlogListClientProps) {
  const [view, setView] = useState<"grid" | "list">("grid");

  const containerClassName = useMemo(() => {
    return view === "grid"
      ? "grid gap-6 md:grid-cols-2 w-full items-stretch"
      : "grid gap-4 grid-cols-1 w-full items-stretch";
  }, [view]);

  return (
    <div className="w-full">
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={`px-2.5 py-1.5 transition-colors ${
              view === "grid"
                ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                : "bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            }`}
            aria-label="Grid view"
          >
            <Grid3x3GapFill size={16} />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`px-2.5 py-1.5 border-l border-neutral-200 dark:border-neutral-700 transition-colors ${
              view === "list"
                ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                : "bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            }`}
            aria-label="List view"
          >
            <ListUl size={16} />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className={containerClassName}
        >
          {posts.map((post) => (
            <ContentCard
              key={post.slug}
              title={post.metadata.title}
              description={post.metadata.summary}
              date={formatDate(post.metadata.publishedAt, false)}
              href={`/blog/${post.slug}`}
              image={post.metadata.image}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
