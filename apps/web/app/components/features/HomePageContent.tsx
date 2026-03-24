"use client";

import React, { Suspense, useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Typography, Card, Flex, Button, Space, Spin } from "antd";
import { formatDate } from "app/lib/utils";
import { useNavigation } from "../ui/NavigationContext";

const { Title, Text, Paragraph } = Typography;

// Lazy load MorphingBlob3D to avoid blocking initial render
const MorphingBlob3D = dynamic(
  () => import("./MorphingBlob3D").then((mod) => ({ default: mod.MorphingBlob3D })),
  {
    ssr: false,
    loading: () => (
      <div className="w-[300px] h-[300px] md:w-[400px] md:h-[400px] flex items-center justify-center">
        <div className="w-32 h-32 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
      </div>
    ),
  }
);

interface BlogPost {
  slug: string;
  metadata: {
    title: string;
    publishedAt: string;
    image?: string;
  };
}

interface HomePageProps {
  recentBlogs: BlogPost[];
}

export function HomePageContent({ recentBlogs }: HomePageProps) {
  const [isPending, setIsPending] = useState(false);
  const [cardLoadingSlug, setCardLoadingSlug] = useState<string | null>(null);
  const [shouldLoad3D, setShouldLoad3D] = useState(false);
  const blobContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { setNavigating, isNavigating } = useNavigation();

  // Intersection Observer to load 3D only when visible
  useEffect(() => {
    if (!blobContainerRef.current) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad3D(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );
    
    observer.observe(blobContainerRef.current);
    
    return () => observer.disconnect();
  }, []);

  const handleNavigation = (href: string) => {
    if (isNavigating || isPending) {
      return;
    }
    if (pathname !== href && !pathname.startsWith(href + "/")) {
      setNavigating(true);
    }
    setIsPending(true);
    router.push(href);
  };

  const handleCardClick = (slug: string) => {
    if (isNavigating || isPending) {
      return;
    }
    const href = `/blog/${slug}`;
    if (pathname !== href && !pathname.startsWith(href + "/")) {
      setNavigating(true);
    }
    setCardLoadingSlug(slug);
    router.push(href);
  };

  return (
    <section suppressHydrationWarning>
      {/* Hero Section */}
      <div style={{ marginBottom: 80 }}>
        <div className="flex flex-col md:flex-row items-start gap-8 md:gap-12" style={{ marginBottom: 32 }}>
          {/* Text Content */}
          <div style={{ flex: 1, alignSelf: "flex-start" }}>
            <Title
              level={1}
              className="text-neutral-900 dark:text-neutral-100"
              style={{
                fontSize: "clamp(2.5rem, 5vw, 3.75rem)",
                marginBottom: 24,
                fontWeight: 700,
              }}
            >
              CodePawl
            </Title>
            <Paragraph
              className="text-neutral-600 dark:text-neutral-300"
              style={{
                fontSize: "clamp(1.25rem, 2vw, 1.5rem)",
                marginBottom: 32,
                lineHeight: 1.6,
              }}
            >
              Exploring the depths of AI, data science, and machine learning through{" "}
              <Link href="/blog" className="link-animated font-medium">
                writing
              </Link>{" "}
              and{" "}
              <Link href="/projects" className="link-animated font-medium">
                projects
              </Link>
              .
            </Paragraph>
            <Space size="middle" wrap>
              <Button
                type="primary"
                size="large"
                loading={isPending}
                onClick={() => handleNavigation("/blog")}
                style={{ minWidth: 140, height: 40 }}
              >
                Read Blog
              </Button>
              <Button
                type="default"
                size="large"
                loading={isPending}
                onClick={() => handleNavigation("/profile")}
                style={{ minWidth: 140, height: 40 }}
              >
                View Profile
              </Button>
            </Space>
          </div>

          {/* Morphing Blob 3D - Hidden on mobile, shown on tablet+ */}
          <div 
            ref={blobContainerRef}
            className="hidden md:block" 
            style={{ flexShrink: 0, width: 300, height: 300 }}
          >
            {shouldLoad3D ? (
              <Suspense
                fallback={
                  <div className="w-[300px] h-[300px] flex items-center justify-center">
                    <div className="w-32 h-32 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
                  </div>
                }
              >
                <MorphingBlob3D
                  width={300}
                  height={300}
                  className="relative z-0"
                />
              </Suspense>
            ) : (
              <div className="w-[300px] h-[300px] flex items-center justify-center">
                <div className="w-32 h-32 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Writings */}
      <div style={{ minHeight: "600px" }}>
        <div className="flex justify-between items-center mb-6" style={{ minHeight: "40px" }}>
          <Title level={2} style={{ margin: 0 }} className="text-neutral-900 dark:text-neutral-100">
            Recent Writings
          </Title>
          <Button
            type="link"
            onClick={() => handleNavigation("/blog")}
            loading={isPending}
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
            style={{ padding: 0, height: "auto", minHeight: "24px" }}
          >
            View all →
          </Button>
        </div>
        <Flex vertical gap="middle" style={{ width: "100%" }}>
          {recentBlogs.map((post) => {
            const isCardLoading = cardLoadingSlug === post.slug;
            const initials =
              post.metadata.title
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("") || "BL";

            return (
              <Card
                key={post.slug}
                hoverable
                size="small"
                style={{ 
                  width: "100%", 
                  cursor: "pointer", 
                  opacity: isCardLoading ? 0.6 : 1, 
                  backgroundColor: "transparent",
                  display: "flex",
                  flexDirection: "column",
                }}
                className="card-shadow-offset"
                onClick={() => handleCardClick(post.slug)}
                styles={{
                  body: {
                    padding: "16px",
                    display: "flex",
                    flexDirection: "row",
                    gap: "16px",
                    alignItems: "stretch",
                    minHeight: "120px",
                  },
                }}
              >
                <div
                  className="relative w-32 h-32 rounded-lg overflow-hidden bg-neutral-200 dark:bg-neutral-800 flex-shrink-0 flex items-center justify-center"
                  aria-hidden="true"
                  style={{ minHeight: "128px" }}
                >
                  {post.metadata.image ? (
                    <Image
                      src={post.metadata.image}
                      alt={post.metadata.title}
                      fill
                      sizes="128px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="text-neutral-700 dark:text-neutral-200 font-semibold text-lg">
                      {initials}
                    </span>
                  )}
                </div>

                <Flex
                  vertical
                  justify="space-between"
                  style={{ flex: 1, minWidth: 0 }}
                  gap="small"
                >
                  <Text
                    strong
                    style={{ fontSize: 16, lineHeight: 1.4 }}
                    className="text-neutral-900 dark:text-neutral-100"
                    ellipsis={{ tooltip: post.metadata.title }}
                  >
                    {post.metadata.title}
                  </Text>
                  <div style={{ marginTop: "auto" }}>
                    <Text
                      type="secondary"
                      className="text-neutral-600 dark:text-neutral-400"
                      style={{ fontSize: 14 }}
                    >
                      {formatDate(post.metadata.publishedAt, false)}
                    </Text>
                    {isCardLoading && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-neutral-500">
                        <Spin size="small" />
                        <span>Loading...</span>
                      </div>
                    )}
                  </div>
                </Flex>
              </Card>
            );
          })}
        </Flex>
      </div>
    </section>
  );
}
