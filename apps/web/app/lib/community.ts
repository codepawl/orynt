/**
 * Community API client functions.
 * Server-side calls use BACKEND_API_URL, client-side uses NEXT_PUBLIC_.
 */

import { getBackendApiUrl } from "@codepawl/shared";
import type {
  CommunityPost,
  CommunityPostList,
  CommunityComment,
} from "@codepawl/shared";

const API_URL = getBackendApiUrl();

// --- Server-side (ISR) fetchers ---

export async function fetchPosts(
  page: number = 1,
  sort: string = "ranked",
  type?: string
): Promise<CommunityPostList | null> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      sort,
      per_page: "20",
    });
    if (type) params.set("type", type);

    const res = await fetch(`${API_URL}/api/community/posts?${params}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchPost(id: string): Promise<CommunityPost | null> {
  try {
    const res = await fetch(`${API_URL}/api/community/posts/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchComments(
  postId: string
): Promise<CommunityComment[] | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/community/posts/${postId}/comments`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// --- Client-side (auth-required) actions ---

export async function createPost(
  token: string,
  data: { type: string; title: string; url?: string; content?: string }
): Promise<CommunityPost> {
  const res = await fetch(`${API_URL}/api/community/posts`, {
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

export async function createComment(
  token: string,
  postId: string,
  data: { content: string; parent_id?: string }
): Promise<CommunityComment> {
  const res = await fetch(
    `${API_URL}/api/community/posts/${postId}/comments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function vote(
  token: string,
  data: { target_id: string; target_type: string; value: number }
): Promise<{ score: number; user_vote: number }> {
  const res = await fetch(`${API_URL}/api/community/vote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Vote failed");
  return res.json();
}

export async function flagContent(
  token: string,
  data: { target_id: string; target_type: string; reason?: string }
): Promise<void> {
  const res = await fetch(`${API_URL}/api/community/flag`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Flag failed");
}
