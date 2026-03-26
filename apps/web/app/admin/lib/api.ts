import type {
  Article,
  DashboardResponse,
  Feed,
  FetchResult,
  PaginatedResponse,
  Tag,
} from "./types";

import { getBackendApiUrl } from "@codepawl/shared";

const API_BASE = getBackendApiUrl();

/**
 * Log in via the backend /api/auth/login endpoint.
 * Sets an httpOnly cookie — no key stored in localStorage.
 */
export async function loginWithKey(key: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ key }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Login failed" }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => {});
}

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}/api/automation${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  const response = await fetch(url, { ...options, headers, credentials: "include" });

  if (response.status === 401) {
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
