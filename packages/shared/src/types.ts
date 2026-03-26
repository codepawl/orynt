/**
 * Shared TypeScript types for CodePawl frontend.
 * These mirror the API response shapes from FastAPI.
 */

// --- Article status ---

export type ArticleStatus =
  | "draft"
  | "review"
  | "published"
  | "rejected"
  | "archived";

// --- Feed ---

export interface Feed {
  id: string;
  name: string;
  url: string;
  category: string;
  is_active: boolean;
  fetch_interval_minutes: number;
  last_fetched_at: string | null;
  error_count: number;
  created_at: string;
}

// --- Article (admin, full) ---

export interface Article {
  id: string;
  feed_id: string | null;
  original_url: string;
  original_title: string;
  original_summary: string | null;
  original_author: string | null;
  original_published_at: string | null;
  slug: string | null;
  title: string;
  summary: string | null;
  tags: string;
  image_url: string | null;
  canonical_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  status: ArticleStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- News article (public, subset) ---

export interface NewsArticle {
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

// --- Tag ---

export interface Tag {
  id: string;
  name: string;
  slug: string;
  article_count: number;
}

// --- Dashboard ---

export interface DashboardStats {
  total_articles: number;
  draft_count: number;
  review_count: number;
  published_count: number;
  rejected_count: number;
  active_feeds: number;
}

export interface DashboardResponse {
  stats: DashboardStats;
  recent: Article[];
}

// --- Pagination ---

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface NewsPaginatedResponse {
  articles: NewsArticle[];
  total: number;
  page: number;
  total_pages: number;
}

// --- Fetch result (admin) ---

export interface FetchResult {
  feed: string;
  new_articles: number;
  skipped_duplicates: number;
  errors: string[];
}
