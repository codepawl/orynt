import React from "react";
import type { Metadata } from "next";
import { projects } from "./project-data";
import { metaData } from "app/config";
import { ProjectsListClient } from "./ProjectsListClient";
import { fetchProjectStats, fetchOrgRepos } from "app/lib/projects";
import type { EnrichedProject } from "./project-data";

export const metadata: Metadata = {
  title: "Projects",
  description: "Explore AI/ML projects and tools built by the CodePawl community.",
  alternates: {
    canonical: `${metaData.baseUrl}projects`,
  },
  openGraph: {
    title: "Projects | CodePawl",
    description: "Explore AI/ML projects and tools built by the CodePawl community.",
    url: `${metaData.baseUrl}projects`,
    siteName: metaData.name,
    locale: "en_US",
    type: "website",
  },
};

export default async function Projects() {
  const [statsMap, orgRepos] = await Promise.all([
    fetchProjectStats(),
    fetchOrgRepos(),
  ]);

  // Build a lookup of static project data by slug (fallback only)
  const staticBySlug = new Map(projects.map((p) => [p.slug, p]));

  let allProjects: EnrichedProject[];

  if (orgRepos.length > 0) {
    // Primary: build from live org repos, use GitHub descriptions
    allProjects = orgRepos
      .filter((r) => r.name !== ".github" && (r.description || r.language))
      .map((r) => {
        const staticFallback = staticBySlug.get(r.name);
        const statsKey = `codepawl/${r.name}`.toLowerCase();
        const stats = statsMap?.get(statsKey);

        return {
          title: r.name,
          year: r.created_at ? new Date(r.created_at).getFullYear() : new Date().getFullYear(),
          description: r.description || staticFallback?.description || `${r.name} — a CodePawl project`,
          url: `https://github.com/${r.full_name}`,
          slug: r.name,
          quickStart: staticFallback?.quickStart || { install: "", example: "" },
          docsUrl: r.homepage || staticFallback?.docsUrl || null,
          packageUrl: staticFallback?.packageUrl || null,
          stats: stats || {
            stars: r.stars,
            forks: r.forks,
            language: r.language,
            lastCommitDate: r.updated_at,
            lastCommitMessage: null,
            latestRelease: null,
            latestReleaseDate: null,
            openIssues: 0,
          },
          isLive: true,
        };
      });
  } else {
    // Fallback: use static data when API is unavailable
    allProjects = projects.map((project) => ({
      ...project,
      stats: undefined,
      isLive: false,
    }));
  }

  // Sort by stars desc
  allProjects.sort((a, b) => {
    const aStars = a.stats?.stars ?? 0;
    const bStars = b.stats?.stars ?? 0;
    return bStars - aStars;
  });

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Projects | CodePawl",
            description: "Explore AI/ML projects and tools built by the CodePawl community.",
            url: `${metaData.baseUrl}projects`,
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: allProjects.length,
              itemListElement: allProjects.map((project, index) => ({
                "@type": "ListItem",
                position: index + 1,
                item: {
                  "@type": "CreativeWork",
                  name: project.title,
                  description: project.description,
                },
              })),
            },
          }),
        }}
      />
      <section>
        <h1 className="mb-8 text-2xl font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
          Projects
        </h1>
        <ProjectsListClient projects={allProjects} />
      </section>
    </>
  );
}
