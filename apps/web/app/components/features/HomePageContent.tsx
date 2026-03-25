"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Typography, Card, Flex, Button, Space } from "antd";
import { formatDate } from "app/lib/utils";
import { AnimatedLogo } from "./AnimatedLogo";

const { Title, Text, Paragraph } = Typography;

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
  return (
    <section>
      {/* Hero Section */}
      <div style={{ marginBottom: 64 }}>
        <div className="flex flex-col md:flex-row items-center gap-8 md:gap-16" style={{ marginBottom: 32 }}>
          {/* Animated Logo — replaces Three.js blob */}
          <div className="flex-shrink-0 order-first md:order-last">
            <AnimatedLogo
              width={220}
              height={220}
              className="mx-auto"
            />
          </div>

          {/* Text Content */}
          <div style={{ flex: 1 }}>
            <Title
              level={1}
              className="text-neutral-900 dark:text-neutral-100"
              style={{
                fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
                marginBottom: 16,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              CodePawl
            </Title>
            <Paragraph
              className="text-neutral-600 dark:text-neutral-300"
              style={{
                fontSize: "clamp(1.1rem, 1.8vw, 1.35rem)",
                marginBottom: 28,
                lineHeight: 1.7,
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
              <Link href="/blog">
                <Button
                  type="primary"
                  size="large"
                  style={{ minWidth: 140, height: 40 }}
                >
                  Read Blog
                </Button>
              </Link>
              <Link href="/about">
                <Button
                  type="default"
                  size="large"
                  style={{ minWidth: 140, height: 40 }}
                >
                  About
                </Button>
              </Link>
            </Space>
          </div>
        </div>
      </div>

      {/* Recent Writings */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <Title level={2} style={{ margin: 0 }} className="text-neutral-900 dark:text-neutral-100">
            Recent Writings
          </Title>
          <Link
            href="/blog"
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 text-sm"
          >
            View all →
          </Link>
        </div>
        <Flex vertical gap="middle" style={{ width: "100%" }}>
          {recentBlogs.map((post) => {
            const initials =
              post.metadata.title
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("") || "BL";

            return (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                style={{ textDecoration: "none", display: "block" }}
              >
              <Card
                hoverable
                size="small"
                style={{
                  width: "100%",
                  cursor: "pointer",
                  backgroundColor: "transparent",
                  display: "flex",
                  flexDirection: "column",
                }}
                className="card-shadow-offset"
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
                  className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-lg overflow-hidden bg-neutral-200 dark:bg-neutral-800 flex-shrink-0 flex items-center justify-center"
                  aria-hidden="true"
                >
                  {post.metadata.image ? (
                    <Image
                      src={post.metadata.image}
                      alt={post.metadata.title}
                      fill
                      sizes="(min-width: 640px) 128px, 112px"
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
                  </div>
                </Flex>
              </Card>
              </Link>
            );
          })}
        </Flex>
      </div>
    </section>
  );
}
