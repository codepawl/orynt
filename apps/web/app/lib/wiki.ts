/**
 * Wiki API client functions.
 */

import { getBackendApiUrl } from "@codepawl/shared";
import type { WikiPage, WikiPageSummary } from "@codepawl/shared";

function getApiUrl(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000";
  }
  return getBackendApiUrl();
}

const API_URL = getApiUrl();

function fetchWithTimeout(url: string, options: RequestInit & { next?: { revalidate: number } } = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timeoutId),
  );
}

// --- Server-side (ISR) fetchers ---

export async function fetchWikiPages(projectSlug: string): Promise<WikiPageSummary[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/wiki/${projectSlug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchWikiPage(projectSlug: string, pageSlug: string): Promise<WikiPage | null> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/wiki/${projectSlug}/${pageSlug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// --- Client-side (auth-required) actions ---

export async function createWikiPage(
  token: string,
  projectSlug: string,
  data: { title: string; slug: string; content: string; parent_id?: string; sort_order?: number },
): Promise<WikiPage> {
  const res = await fetch(`${API_URL}/api/wiki/${projectSlug}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function updateWikiPage(
  token: string,
  projectSlug: string,
  pageSlug: string,
  data: { title?: string; content?: string; parent_id?: string; sort_order?: number; is_published?: boolean },
): Promise<WikiPage> {
  const res = await fetch(`${API_URL}/api/wiki/${projectSlug}/${pageSlug}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function deleteWikiPage(
  token: string,
  projectSlug: string,
  pageSlug: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/wiki/${projectSlug}/${pageSlug}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
}
