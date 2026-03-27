"use client";

import Link from "next/link";
import Image from "next/image";
import { formatDate } from "app/lib/utils";
import { AnimatedLogo } from "./AnimatedLogo";

interface BlogPost {
  slug: string;
  metadata: {
    title: string;
    publishedAt: string;
    summary: string;
    tags: string;
    image?: string;
  };
}

interface HomePageProps {
  recentBlogs: BlogPost[];
}

function estimateReadingTime(tags: string): string {
  // Rough estimate based on typical post length
  const tagCount = tags ? tags.split(",").length : 0;
  return `${Math.max(3, tagCount + 2)} min read`;
}

export function HomePageContent({ recentBlogs }: HomePageProps) {
  return (
    <section>
      {/* Hero Section */}
      <div className="mb-16">
        <div className="flex flex-col md:flex-row items-center gap-8 md:gap-16 mb-8">
          {/* Animated Logo */}
          <div className="flex-shrink-0 order-first md:order-last">
            <AnimatedLogo
              width={220}
              height={220}
              className="mx-auto"
            />
          </div>

          {/* Text Content */}
          <div className="flex-1">
            <h1
              className="text-neutral-900 dark:text-neutral-100 font-bold tracking-tight mb-4"
              style={{ fontSize: "clamp(2.25rem, 5vw, 3.5rem)" }}
            >
              CodePawl
            </h1>
            <p
              className="text-neutral-600 dark:text-neutral-300 mb-7 leading-relaxed"
              style={{ fontSize: "clamp(1.1rem, 1.8vw, 1.35rem)" }}
            >
              An open community for AI builders, researchers, and curious minds.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                href="/blog"
                className="inline-flex items-center justify-center px-6 py-2.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 transition-opacity no-underline min-w-[140px]"
              >
                Read Blog
              </Link>
              <Link
                href="/about"
                className="inline-flex items-center justify-center px-6 py-2.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors no-underline min-w-[140px]"
              >
                About
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Writings */}
      <div className="mb-16">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
            Recent Writings
          </h2>
          <Link
            href="/blog"
            className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 text-sm no-underline"
          >
            View all →
          </Link>
        </div>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
          {recentBlogs.map((post) => {
            const initials =
              post.metadata.title
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("") || "BL";

            const firstTag = post.metadata.tags
              ?.split(",")
              .map((t) => t.trim())
              .filter(Boolean)[0];

            return (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="flex items-center gap-4 px-4 py-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors no-underline group"
              >
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex-shrink-0 flex items-center justify-center">
                  {post.metadata.image ? (
                    <Image
                      src={post.metadata.image}
                      alt={post.metadata.title}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="text-neutral-500 dark:text-neutral-400 font-semibold text-xs">
                      {initials}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors">
                    {post.metadata.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {formatDate(post.metadata.publishedAt, false)}
                    </span>
                    {firstTag && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 rounded-full">
                        {firstTag}
                      </span>
                    )}
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">
                      {estimateReadingTime(post.metadata.tags)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
