"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "react-bootstrap-icons";
import docsNav from "../_config/nav";

function findTitle(slug: string): string {
  for (const item of docsNav) {
    if (item.slug === slug) return item.title;
    if (item.children) {
      for (const child of item.children) {
        if (child.slug === slug) return child.title;
      }
    }
  }
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.replace("/docs", "").split("/").filter(Boolean);

  return (
    <nav className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400 mb-6">
      <Link
        href="/docs"
        className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline transition-colors"
      >
        Docs
      </Link>
      {segments.map((segment, i) => {
        const href = `/docs/${segments.slice(0, i + 1).join("/")}`;
        const isLast = i === segments.length - 1;
        const title = findTitle(segment);

        return (
          <span key={segment} className="flex items-center gap-1.5">
            <ChevronRight size={10} className="text-neutral-400 dark:text-neutral-600" />
            {isLast ? (
              <span className="text-neutral-900 dark:text-neutral-100">
                {title}
              </span>
            ) : (
              <Link
                href={href}
                className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline transition-colors"
              >
                {title}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
