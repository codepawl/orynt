import React from "react";
import type { Metadata } from "next";
import { projects } from "./project-data";
import { metaData } from "app/config";
import { ProjectsListClient } from "./ProjectsListClient";
import { fetchProjectStats, fetchOrgRepos, mergeProjectData } from "app/lib/projects";
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

  // Start with static curated projects enriched with live stats
  const enrichedStatic = mergeProjectData(projects, statsMap);
  const staticSlugs = new Set(projects.map((p) => p.slug));

  // Add org repos that aren't already in static data
  const orgProjects: EnrichedProject[] = orgRepos
    .filter((r) => !staticSlugs.has(r.name) && r.name !== "codepawl") // skip the org meta-repo
    .map((r) => ({
      title: r.name,
      year: r.created_at ? new Date(r.created_at).getFullYear() : new Date().getFullYear(),
      description: r.description || `${r.name} — a CodePawl project`,
      url: `https://github.com/${r.full_name}`,
      slug: r.name,
      quickStart: { install: "", example: "" },
      docsUrl: r.homepage || null,
      packageUrl: null,
      stats: {
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
    }));

  // Combine and sort by stars desc
  const allProjects = [...enrichedStatic, ...orgProjects].sort((a, b) => {
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
