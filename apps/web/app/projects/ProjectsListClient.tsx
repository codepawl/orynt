"use client";

import { useMemo, useState, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Grid3x3GapFill, ListUl, StarFill, Diagram2 } from "react-bootstrap-icons";
import { ContentCard } from "../components/ui/ContentCard";
import type { EnrichedProject } from "./project-data";

interface ProjectsListClientProps {
  projects: EnrichedProject[];
}

export function ProjectsListClient({ projects }: ProjectsListClientProps) {
  const [, startTransition] = useTransition();
  const [view, setView] = useState<"grid" | "list">("grid");

  const handleClick = (url: string, external: boolean) => {
    startTransition(() => {
      if (external) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = url;
      }
    });
  };

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
          {projects.map((project, index) => (
            <div key={index}>
              <ContentCard
                title={project.title}
                description={project.description}
                year={project.year}
                href={`/projects/${project.slug}`}
                onClick={() => handleClick(`/projects/${project.slug}`, false)}
              />
              {project.stats && (
                <div className="flex items-center gap-3 mt-1.5 px-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {project.stats.language && (
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />
                      {project.stats.language}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    {project.isLive && (
                      <span className="relative flex h-2 w-2" title="Live data from GitHub">
                        <motion.span
                          className="absolute inline-flex h-full w-full rounded-full bg-green-400"
                          animate={{ scale: [1, 1.5, 1], opacity: [0.75, 0, 0.75] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                        />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                    )}
                    <StarFill size={12} />
                    {project.stats.stars}
                  </span>
                  {project.stats.forks > 0 && (
                    <span className="flex items-center gap-1">
                      <Diagram2 size={12} />
                      {project.stats.forks}
                    </span>
                  )}
                  <span className="ml-auto text-neutral-400 dark:text-neutral-500">
                    View details &rarr;
                  </span>
                </div>
              )}
              {!project.stats && (
                <div className="flex items-center mt-1.5 px-2 text-xs">
                  <span className="ml-auto text-neutral-400 dark:text-neutral-500">
                    View details &rarr;
                  </span>
                </div>
              )}
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
