"use client";

import { useState } from "react";
import Link from "next/link";
import type { CommunityPost } from "@codepawl/shared";
import { MarkdownRenderer } from "app/components/ui/MarkdownRenderer";

interface TabDef {
  key: string;
  label: string;
}

interface Props {
  sections: Record<string, string>;
  installCommand: string;
  exampleCode: string;
  communityPosts: CommunityPost[];
  relatedBlogPosts: { slug: string; title: string; date: string }[];
  slug: string;
  repoOwner?: string;
  repoName?: string;
  defaultBranch?: string;
}

export function ProjectHubTabs({
  sections,
  installCommand,
  exampleCode,
  communityPosts,
  relatedBlogPosts,
  slug,
  repoOwner,
  repoName,
  defaultBranch,
}: Props) {
  const repoInfo = repoOwner && repoName
    ? { owner: repoOwner, name: repoName, defaultBranch: defaultBranch || "main" }
    : undefined;
  const tabs: TabDef[] = [
    { key: "overview", label: "Overview" },
    { key: "installation", label: "Installation" },
  ];
  if (sections.api_reference || sections.usage) tabs.push({ key: "api", label: "API" });
  if (sections.benchmarks) tabs.push({ key: "benchmarks", label: "Benchmarks" });
  tabs.push({ key: "community", label: "Community" });

  const [active, setActive] = useState("overview");

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-6 mb-6 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto overflow-y-hidden">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`pb-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap cursor-pointer bg-transparent border-none ${
              active === tab.key
                ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100 border-b-2"
                : "border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
            style={{ borderBottomWidth: 2, borderBottomStyle: "solid" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {active === "overview" && (
        <div className="space-y-6">
          {sections.features && (
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-3">Key features</h3>
              <MarkdownRenderer repo={repoInfo} content={sections.features} />
            </div>
          )}
          {!sections.features && sections.usage && (
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-3">Usage</h3>
              <MarkdownRenderer repo={repoInfo} content={sections.usage} />
            </div>
          )}
          {sections.citation && (
            <div className="mt-8">
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-3">Citation</h3>
              <MarkdownRenderer repo={repoInfo} content={sections.citation} />
            </div>
          )}
          {!sections.features && !sections.usage && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
                  Install
                </p>
                <pre className="bg-neutral-900 dark:bg-neutral-800 rounded-lg p-4 overflow-x-auto">
                  <code className="text-sm font-mono text-neutral-100">{installCommand}</code>
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
                  Example
                </p>
                <pre className="bg-neutral-900 dark:bg-neutral-800 rounded-lg p-4 overflow-x-auto">
                  <code className="text-sm font-mono text-neutral-100">{exampleCode}</code>
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {active === "installation" && (
        <div className="space-y-6">
          {sections.installation ? (
            <MarkdownRenderer repo={repoInfo} content={sections.installation} />
          ) : installCommand && (
            <div>
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
                Install
              </p>
              <pre className="bg-neutral-900 dark:bg-neutral-800 rounded-lg p-4 overflow-x-auto">
                <code className="text-sm font-mono text-neutral-100">{installCommand}</code>
              </pre>
            </div>
          )}
          {sections.requirements && (
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-3">Requirements</h3>
              <MarkdownRenderer repo={repoInfo} content={sections.requirements} />
            </div>
          )}
          {!sections.installation && !sections.requirements && (
            <div>
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
                Quick start example
              </p>
              <pre className="bg-neutral-900 dark:bg-neutral-800 rounded-lg p-4 overflow-x-auto">
                <code className="text-sm font-mono text-neutral-100">{exampleCode}</code>
              </pre>
            </div>
          )}
        </div>
      )}

      {active === "api" && (
        <div>
          {sections.api_reference ? (
            <MarkdownRenderer repo={repoInfo} content={sections.api_reference} />
          ) : sections.usage ? (
            <MarkdownRenderer repo={repoInfo} content={sections.usage} />
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No API documentation available in README. Check the{" "}
              <a href={`https://github.com/codepawl/${slug}#readme`} target="_blank" rel="noopener noreferrer" className="underline">
                full README
              </a>{" "}
              for details.
            </p>
          )}
        </div>
      )}

      {active === "benchmarks" && (
        <div>
          {sections.benchmarks ? (
            <MarkdownRenderer repo={repoInfo} content={sections.benchmarks} />
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No benchmarks available yet.
            </p>
          )}
        </div>
      )}

      {active === "community" && (
        <div className="space-y-8">
          {/* Community discussions */}
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
              Discussions
            </h3>
            {communityPosts.length > 0 ? (
              <>
                <ul className="space-y-2">
                  {communityPosts.map((post) => (
                    <li key={post.id}>
                      <Link
                        href={`/community/post/${post.id}`}
                        className="flex items-baseline gap-2 group no-underline"
                      >
                        <span className="text-sm text-neutral-900 dark:text-neutral-100 group-hover:underline">
                          {post.title}
                        </span>
                        <span className="text-xs text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
                          {post.comment_count} comment{post.comment_count !== 1 ? "s" : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/community?tag=${encodeURIComponent(slug)}`}
                  className="inline-block mt-3 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 no-underline"
                >
                  View all discussions &rarr;
                </Link>
              </>
            ) : (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No discussions yet.
              </p>
            )}
            <div className="mt-3">
              <Link
                href={`/community/submit?tags=${encodeURIComponent(slug)}`}
                className="inline-flex px-4 py-2 text-sm font-medium rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors no-underline"
              >
                Start a discussion
              </Link>
            </div>
          </div>

          {/* Related blog posts */}
          {relatedBlogPosts.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                Related blog posts
              </h3>
              <ul className="space-y-2">
                {relatedBlogPosts.map((post) => (
                  <li key={post.slug}>
                    <Link
                      href={`/blog/${post.slug}`}
                      className="flex items-baseline gap-2 group no-underline"
                    >
                      <span className="text-sm text-neutral-900 dark:text-neutral-100 group-hover:underline">
                        {post.title}
                      </span>
                      <span className="text-xs text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
                        {post.date}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
