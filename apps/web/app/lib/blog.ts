/**
 * Blog API client functions.
 */

import { getBackendApiUrl } from "@codepawl/shared";
import type { BlogPost, BlogPostList } from "@codepawl/shared";

function getApiUrl(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000";
  }
  return getBackendApiUrl();
}

const API_URL = getApiUrl();

// --- Public (ISR, server-side) ---

export async function fetchBlogPosts(
  page: number = 1,
  tag?: string,
  revalidate = 600
): Promise<BlogPostList | null> {
  try {
    const params = new URLSearchParams({ page: String(page), per_page: "20" });
    if (tag) params.set("tag", tag);
    const res = await fetch(`${API_URL}/api/blog/posts?${params}`, {
      next: { revalidate },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchBlogPost(
  slug: string,
  revalidate = 600
): Promise<BlogPost | null> {
  try {
    const res = await fetch(`${API_URL}/api/blog/posts/${slug}`, {
      next: { revalidate },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// --- Auth-required ---

export async function fetchMyPosts(token: string): Promise<BlogPostList | null> {
  try {
    const res = await fetch(`${API_URL}/api/blog/my-posts`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function createBlogPost(
  token: string,
  data: {
    title: string;
    content: string;
    content_markdown?: string;
    summary?: string;
    cover_image_url?: string;
    tags?: string;
    status?: "draft" | "review";
  }
): Promise<BlogPost> {
  const res = await fetch(`${API_URL}/api/blog/posts`, {
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

export async function updateBlogPost(
  token: string,
  postId: string,
  data: {
    title?: string;
    content?: string;
    content_markdown?: string;
    summary?: string;
    cover_image_url?: string;
    tags?: string;
  }
): Promise<BlogPost> {
  const res = await fetch(`${API_URL}/api/blog/posts/${postId}`, {
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

export async function updateBlogPostStatus(
  token: string,
  postId: string,
  status: "draft" | "review" | "published"
): Promise<BlogPost> {
  const res = await fetch(`${API_URL}/api/blog/posts/${postId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchAllBlogPosts(
  token: string,
  status?: string,
  page: number = 1
): Promise<BlogPostList | null> {
  try {
    const params = new URLSearchParams({ page: String(page), per_page: "20" });
    if (status) params.set("status", status);
    const apiUrl = typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000"
      : getBackendApiUrl();
    const res = await fetch(`${apiUrl}/api/blog/admin/posts?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function deleteBlogPost(token: string, postId: string): Promise<void> {
  const apiUrl = typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000"
    : getBackendApiUrl();
  const res = await fetch(`${apiUrl}/api/blog/posts/${postId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
}

export async function uploadBlogImage(
  token: string,
  file: File
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/blog/upload-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.url;
}
