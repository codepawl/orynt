"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Segmented } from "antd";
import { LayoutGrid, List } from "lucide-react";
import { ContentCard } from "../components/ui/ContentCard";

interface Project {
  title: string;
  year: number | string;
  description: string;
  url: string;
}

interface ProjectsListClientProps {
  projects: Project[];
}

export function ProjectsListClient({ projects }: ProjectsListClientProps) {
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [isSwitchingView, setIsSwitchingView] = useState(false);
  const switchTimerRef = useRef<number | null>(null);

  const handleClick = (url: string, e: React.MouseEvent) => {
    startTransition(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
  };

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
        {projects.map((project, index) => (
          <ContentCard
            key={index}
            title={project.title}
            description={project.description}
            year={project.year}
            href={project.url}
            onClick={(e) => handleClick(project.url, e)}
            external={true}
          />
        ))}
      </div>
    </div>
  );
}
