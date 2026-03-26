/**
 * Fetch helpers for public /api/news endpoints.
 * Uses BACKEND_API_URL (server-side only), ISR-compatible with 8s timeout.
 */

import type { NewsArticle, NewsPaginatedResponse, Tag as NewsTag } from "@codepawl/shared";
import { getBackendApiUrl } from "@codepawl/shared";

const API_URL = getBackendApiUrl();

async function fetchWithTimeout<T>(url: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 300 },
    } as RequestInit);

    clearTimeout(timeout);

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export async function fetchNews(
  page: number = 1,
  tag?: string
): Promise<NewsPaginatedResponse | null> {
  const params = new URLSearchParams({ page: String(page), per_page: "12" });
  if (tag) params.set("tag", tag);
  return fetchWithTimeout<NewsPaginatedResponse>(
    `${API_URL}/api/news?${params}`
  );
}

export async function fetchNewsArticle(
  slug: string
): Promise<NewsArticle | null> {
  return fetchWithTimeout<NewsArticle>(`${API_URL}/api/news/${slug}`);
}

export async function fetchNewsTags(): Promise<NewsTag[] | null> {
  return fetchWithTimeout<NewsTag[]>(`${API_URL}/api/news/tags`);
}

export type { NewsArticle, NewsPaginatedResponse, NewsTag };
