"use client";

import { useState } from "react";
import Link from "next/link";

interface Props {
  topTags: string[];
  allTags: string[];
  activeTag?: string;
  sort: string;
  projectSlugs: Set<string>;
}

export function TagFilterBar({ topTags, allTags, activeTag, sort, projectSlugs }: Props) {
  const [expanded, setExpanded] = useState(false);

  const visibleTags = expanded ? allTags : topTags;
  const hasMore = allTags.length > topTags.length;

  const pillCls = (active: boolean) =>
    `px-2.5 py-1 text-xs font-medium rounded-full no-underline transition-colors whitespace-nowrap ${
      active
        ? "bg-amber-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/30"
        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
    }`;

  return (
    <div className="mb-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none flex-wrap sm:flex-nowrap">
        <Link
          href={`/community?sort=${sort}`}
          className={pillCls(!activeTag)}
        >
          All
        </Link>
        {visibleTags.map((tag) => {
          const isProject = projectSlugs.has(tag);
          const href = isProject ? `/projects/${tag}` : `/community?tag=${encodeURIComponent(tag)}&sort=${sort}`;
          return (
            <Link key={tag} href={href} className={pillCls(activeTag === tag)}>
              {tag}
            </Link>
          );
        })}
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="px-2.5 py-1 text-xs font-medium rounded-full bg-transparent border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            {expanded ? "Less ▴" : "More ▾"}
          </button>
        )}
      </div>
    </div>
  );
}
