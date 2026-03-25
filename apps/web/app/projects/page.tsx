import React from "react";
import type { Metadata } from "next";
import { projects } from "./project-data";
import { metaData } from "app/config";
import { ProjectsListClient } from "./ProjectsListClient";
import { fetchProjectStats, mergeProjectData } from "app/lib/projects";

export const metadata: Metadata = {
  title: "Projects",
  description: "Explore machine learning projects, data science applications, and AI solutions developed by Nguyen Xuan An. From research to production implementations.",
  alternates: {
    canonical: `${metaData.baseUrl}projects`,
  },
  openGraph: {
    title: "Projects | CodePawl",
    description: "Explore machine learning projects, data science applications, and AI solutions developed by Nguyen Xuan An.",
    url: `${metaData.baseUrl}projects`,
    images: [`${metaData.baseUrl}/og?title=${encodeURIComponent("Projects | CodePawl")}`],
    siteName: metaData.name,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Projects | CodePawl",
    description: "Explore machine learning projects, data science applications, and AI solutions developed by Nguyen Xuan An.",
  },
};

export default async function Projects() {
  const statsMap = await fetchProjectStats();
  const enrichedProjects = mergeProjectData(projects, statsMap);

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
            description: "Explore machine learning projects, data science applications, and AI solutions.",
            url: `${metaData.baseUrl}projects`,
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: projects.length,
              itemListElement: projects.map((project, index) => ({
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
        <ProjectsListClient projects={enrichedProjects} />
      </section>
    </>
  );
}
