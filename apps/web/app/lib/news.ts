/**
 * Fetch helpers for public /api/news endpoints.
 * Uses BACKEND_API_URL (server-side only), ISR-compatible with 8s timeout.
 */

const API_URL = process.env.BACKEND_API_URL || "http://localhost:8000";

interface NewsArticle {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  tags: string;
  image_url: string | null;
  canonical_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  published_at: string | null;
  original_url: string;
  original_title: string;
  original_author: string | null;
}

interface NewsPaginatedResponse {
  articles: NewsArticle[];
  total: number;
  page: number;
  total_pages: number;
}

interface NewsTag {
  id: string;
  name: string;
  slug: string;
  article_count: number;
}

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
