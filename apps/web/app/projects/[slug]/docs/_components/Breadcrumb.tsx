"use client";

import Link from "next/link";
import { ChevronRight } from "react-bootstrap-icons";

interface Props {
  projectSlug: string;
  projectName: string;
  docPath: string[];
}

function titleFromSegment(segment: string): string {
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/, (c) => c.toUpperCase());
}

export function Breadcrumb({ projectSlug, projectName, docPath }: Props) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400 mb-6 flex-wrap">
      <Link
        href="/projects"
        className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline transition-colors"
      >
        Projects
      </Link>
      <ChevronRight size={10} className="text-neutral-400 dark:text-neutral-600" />
      <Link
        href={`/projects/${projectSlug}`}
        className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline transition-colors"
      >
        {projectName}
      </Link>
      <ChevronRight size={10} className="text-neutral-400 dark:text-neutral-600" />
      {docPath.length === 0 ? (
        <span className="text-neutral-900 dark:text-neutral-100">Docs</span>
      ) : (
        <>
          <Link
            href={`/projects/${projectSlug}/docs`}
            className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline transition-colors"
          >
            Docs
          </Link>
          {docPath.map((segment, i) => {
            const isLast = i === docPath.length - 1;
            const href = `/projects/${projectSlug}/docs/${docPath.slice(0, i + 1).join("/")}`;
            return (
              <span key={segment} className="flex items-center gap-1.5">
                <ChevronRight size={10} className="text-neutral-400 dark:text-neutral-600" />
                {isLast ? (
                  <span className="text-neutral-900 dark:text-neutral-100">
                    {titleFromSegment(segment)}
                  </span>
                ) : (
                  <Link
                    href={href}
                    className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline transition-colors"
                  >
                    {titleFromSegment(segment)}
                  </Link>
                )}
              </span>
            );
          })}
        </>
      )}
    </nav>
  );
}
