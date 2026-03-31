import type {
  Article,
  DashboardResponse,
  Feed,
  FetchResult,
  PaginatedResponse,
  Tag,
} from "./types";

import { getBackendApiUrl } from "@codepawl/shared";
import { createClient } from "app/lib/supabase/client";

const API_BASE = getBackendApiUrl();

async function getToken(): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}/api/automation${path}`;
  const token = await getToken();

  if (!token) {
    if (typeof window !== "undefined") {
      window.location.href = "/login?redirect=/admin";
    }
    throw new Error("Not authenticated");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
    Authorization: `Bearer ${token}`,
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      window.location.href = "/login?redirect=/admin";
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
  // Fetch token once; both requests share it
  const [stats, recent] = await Promise.all([
    adminFetch<DashboardResponse["stats"]>("/stats"),
    adminFetch<DashboardResponse["recent"]>("/recent?limit=10").catch(() => [] as DashboardResponse["recent"]),
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
export const createArticle = (data: Partial<Article>) =>
  adminFetch<Article>("/articles", { method: "POST", body: JSON.stringify(data) });
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

// Community (admin actions via community API)
async function communityFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  if (!token) {
    if (typeof window !== "undefined") window.location.href = "/login?redirect=/admin";
    throw new Error("Not authenticated");
  }
  const url = `${API_BASE}/api/community${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
    Authorization: `Bearer ${token}`,
  };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/login?redirect=/admin";
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  if (response.status === 204) return {} as T;
  return response.json();
}

export const adminDeletePost = (postId: string) =>
  communityFetch<void>(`/posts/${postId}`, { method: "DELETE" });
export const adminDeleteComment = (commentId: string) =>
  communityFetch<void>(`/comments/${commentId}`, { method: "DELETE" });
export const adminBanUser = (userId: string) =>
  communityFetch<{ ok: boolean }>(`/users/${userId}/ban`, { method: "PATCH" });

// Tags
export const getTags = () => adminFetch<Tag[]>("/tags");

// Workers
export const triggerCollectAll = () =>
  adminFetch<{ feeds_processed: number; new_articles: number; skipped_duplicates: number }>(
    "/workers/collect",
    { method: "POST" },
  );
