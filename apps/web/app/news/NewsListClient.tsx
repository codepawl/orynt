"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Card, Flex, Pagination, Tag, Typography } from "antd";
import type { NewsArticle, NewsTag } from "app/lib/news";
import { getBackendApiUrl } from "@codepawl/shared";

const { Text } = Typography;

const API_URL = getBackendApiUrl();

interface Props {
  initialArticles: NewsArticle[];
  initialTotal: number;
  initialTotalPages: number;
  tags: NewsTag[];
  activeTag?: string;
}

export function NewsListClient({
  initialArticles,
  initialTotal,
  initialTotalPages,
  tags,
  activeTag,
}: Props) {
  const [articles, setArticles] = useState(initialArticles);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [selectedTag, setSelectedTag] = useState(activeTag || "");
  const [loading, setLoading] = useState(false);

  const loadPage = useCallback(
    async (newPage: number, tag?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(newPage),
          per_page: "12",
        });
        if (tag) params.set("tag", tag);
        const res = await fetch(`${API_URL}/api/news?${params}`);
        if (res.ok) {
          const data = await res.json();
          setArticles(data.articles);
          setTotal(data.total);
          setTotalPages(data.total_pages);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handlePageChange = (p: number) => {
    setPage(p);
    loadPage(p, selectedTag);
  };

  const handleTagClick = (tagSlug: string) => {
    const newTag = tagSlug === selectedTag ? "" : tagSlug;
    setSelectedTag(newTag);
    setPage(1);
    loadPage(1, newTag);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div>
      {/* Tag filters */}
      {tags.length > 0 && (
        <Flex wrap gap="small" style={{ marginBottom: 24 }}>
          {tags.map((tag) => (
            <Tag
              key={tag.slug}
              color={selectedTag === tag.slug ? "blue" : "default"}
              onClick={() => handleTagClick(tag.slug)}
              style={{ cursor: "pointer" }}
            >
              {tag.name} ({tag.article_count})
            </Tag>
          ))}
        </Flex>
      )}

      {/* Article grid */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          opacity: loading ? 0.6 : 1,
          transition: "opacity 200ms",
        }}
      >
        {articles.map((article) => (
          <Link
            key={article.slug}
            href={`/news/${article.slug}`}
            style={{ textDecoration: "none", display: "block" }}
          >
            <Card
              hoverable
              size="small"
              className="card-shadow-offset"
              style={{
                height: "100%",
                backgroundColor: "transparent",
              }}
            >
              <Flex vertical gap="small" style={{ minHeight: 120 }}>
                <Text
                  strong
                  className="text-neutral-900 dark:text-neutral-100"
                  style={{ fontSize: 15, lineHeight: 1.4 }}
                  ellipsis
                >
                  {article.title}
                </Text>
                {article.summary && (
                  <Text
                    className="text-neutral-600 dark:text-neutral-400"
                    style={{ fontSize: 13, lineHeight: 1.5 }}
                    ellipsis
                  >
                    {article.summary}
                  </Text>
                )}
                <div style={{ marginTop: "auto" }}>
                  <Flex justify="space-between" align="center">
                    <Flex gap={4} wrap>
                      {article.tags &&
                        article.tags
                          .split(",")
                          .slice(0, 3)
                          .map((t) => (
                            <Tag
                              key={t.trim()}
                              style={{ fontSize: 11, margin: 0 }}
                            >
                              {t.trim()}
                            </Tag>
                          ))}
                    </Flex>
                    <Text
                      type="secondary"
                      style={{ fontSize: 12, flexShrink: 0 }}
                    >
                      {formatDate(article.published_at)}
                    </Text>
                  </Flex>
                </div>
              </Flex>
            </Card>
          </Link>
        ))}
      </div>

      {articles.length === 0 && !loading && (
        <div className="text-center py-16">
          <Text type="secondary">No news articles yet. Check back soon.</Text>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center" style={{ marginTop: 32 }}>
          <Pagination
            current={page}
            total={total}
            pageSize={12}
            onChange={handlePageChange}
            showSizeChanger={false}
          />
        </div>
      )}
    </div>
  );
}
