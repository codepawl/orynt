"use client";

import Link from "next/link";
import { Typography, Flex } from "antd";
import { formatDate } from "app/lib/utils";

const { Title, Text } = Typography;

interface BlogPostHeaderProps {
  title: string;
  publishedAt: string;
  readingTimeMinutes?: number;
}

export function BlogPostHeader({
  title,
  publishedAt,
  readingTimeMinutes,
}: BlogPostHeaderProps) {
  return (
    <>
      <Link
        href="/blog"
        className="inline-flex items-center text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors mb-6 text-sm"
      >
        <span className="mr-2">←</span>
        <span>Back to Blog</span>
      </Link>
      <Title
        level={1}
        className="text-neutral-900 dark:text-neutral-100"
        style={{ marginBottom: 12, fontWeight: 500 }}
      >
        {title}
      </Title>
      <Flex justify="space-between" align="center" style={{ marginTop: 8, marginBottom: 32 }}>
        <Text
          type="secondary"
          className="text-neutral-600 dark:text-neutral-400"
          style={{ fontSize: 14 }}
        >
          {formatDate(publishedAt)}
          {typeof readingTimeMinutes === "number" && (
            <span aria-hidden="true">{` · ${readingTimeMinutes} min read`}</span>
          )}
        </Text>
      </Flex>
    </>
  );
}
