import type {
  Article,
  DashboardResponse,
  Feed,
  FetchResult,
  PaginatedResponse,
  Tag,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000";

function getAdminKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("admin_key") || "";
}

export function setAdminKey(key: string): void {
  localStorage.setItem("admin_key", key);
  document.cookie = `admin_key=${key}; path=/; max-age=86400; SameSite=Strict`;
}

export function clearAdminKey(): void {
  localStorage.removeItem("admin_key");
  document.cookie = "admin_key=; path=/; max-age=0";
}

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}/api/automation${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Admin-Key": getAdminKey(),
    ...(options.headers as Record<string, string> || {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearAdminKey();
    if (typeof window !== "undefined") {
      window.location.href = "/admin/login";
    }
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

// Dashboard
export const getDashboard = async (): Promise<DashboardResponse> => {
  const [stats, recent] = await Promise.all([
    adminFetch<DashboardResponse["stats"]>("/stats"),
    adminFetch<DashboardResponse["recent"]>("/recent?limit=10"),
  ]);
  return { stats, recent };
};

// Feeds
export const getFeeds = () => adminFetch<Feed[]>("/feeds");
export const createFeed = (data: Partial<Feed>) =>
  adminFetch<Feed>("/feeds", { method: "POST", body: JSON.stringify(data) });
export const updateFeed = (id: string, data: Partial<Feed>) =>
  adminFetch<Feed>(`/feeds/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteFeed = (id: string) =>
  adminFetch<void>(`/feeds/${id}`, { method: "DELETE" });
export const fetchFeed = (id: string) =>
  adminFetch<FetchResult>(`/feeds/${id}/fetch`, { method: "POST" });

// Articles
export const getArticles = (params: Record<string, string | number> = {}) => {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") query.set(k, String(v));
  }
  return adminFetch<PaginatedResponse<Article>>(`/articles?${query}`);
};
export const getArticle = (id: string) => adminFetch<Article>(`/articles/${id}`);
export const updateArticle = (id: string, data: Partial<Article>) =>
  adminFetch<Article>(`/articles/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const changeArticleStatus = (id: string, status: string) =>
  adminFetch<Article>(`/articles/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
export const bulkChangeStatus = (ids: string[], status: string) =>
  adminFetch<{ updated: number }>("/articles/bulk-status", {
    method: "POST",
    body: JSON.stringify({ ids, status }),
  });
export const deleteArticle = (id: string) =>
  adminFetch<void>(`/articles/${id}`, { method: "DELETE" });

// Tags
export const getTags = () => adminFetch<Tag[]>("/tags");

// Workers
export const triggerCollectAll = () =>
  adminFetch<{ feeds_processed: number; new_articles: number; skipped_duplicates: number }>(
    "/workers/collect",
    { method: "POST" },
  );
