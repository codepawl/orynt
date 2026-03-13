"use client";

import { useMemo, useRef, useState } from "react";
import { Segmented } from "antd";
import { LayoutGrid, List } from "lucide-react";
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
  const [isSwitchingView, setIsSwitchingView] = useState(false);
  const switchTimerRef = useRef<number | null>(null);

  const containerClassName = useMemo(() => {
    return view === "grid"
      ? "grid gap-6 md:grid-cols-2 w-full items-stretch"
      : "grid gap-4 grid-cols-1 w-full items-stretch";
  }, [view]);

  const handleViewChange = (nextView: "grid" | "list") => {
    if (nextView === view) return;
    if (switchTimerRef.current) {
      window.clearTimeout(switchTimerRef.current);
    }

    setIsSwitchingView(true);
    switchTimerRef.current = window.setTimeout(() => {
      setView(nextView);
      // allow layout to paint before fading in
      window.setTimeout(() => setIsSwitchingView(false), 20);
    }, 120);
  };

  return (
    <div className="w-full">
      <div className="flex justify-end mb-4">
        <Segmented<"grid" | "list">
          size="small"
          value={view}
          onChange={(val) => handleViewChange(val)}
          options={[
            { label: <LayoutGrid size={16} />, value: "grid" },
            { label: <List size={16} />, value: "list" },
          ]}
        />
      </div>

      <div
        className={`${containerClassName} transition-all duration-200 ease-out ${
          isSwitchingView ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"
        }`}
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
      </div>
    </div>
  );
}
