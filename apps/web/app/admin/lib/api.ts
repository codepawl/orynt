import { getBackendApiUrl } from "@codepawl/shared";
import { createClient } from "app/lib/supabase/client";

const API_BASE = getBackendApiUrl();

async function getToken(): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

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
