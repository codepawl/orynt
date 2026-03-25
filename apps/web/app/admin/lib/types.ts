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
  status: "draft" | "review" | "published" | "rejected" | "archived";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  article_count: number;
}

export interface DashboardStats {
  total_articles: number;
  draft_count: number;
  review_count: number;
  published_count: number;
  rejected_count: number;
  active_feeds: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface DashboardResponse {
  stats: DashboardStats;
  recent: Article[];
}

export interface FetchResult {
  feed: string;
  new_articles: number;
  skipped_duplicates: number;
  errors: string[];
}
