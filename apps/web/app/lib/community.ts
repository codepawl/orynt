/**
 * Community API client functions.
 * Server-side calls use BACKEND_API_URL, client-side uses NEXT_PUBLIC_.
 */

import { getBackendApiUrl } from "@codepawl/shared";
import type {
  CommunityPost,
  CommunityPostList,
  CommunityComment,
  Notification,
} from "@codepawl/shared";

/**
 * Server-side calls use BACKEND_API_URL (internal).
 * Client-side calls use NEXT_PUBLIC_BACKEND_API_URL (browser-accessible).
 */
function getApiUrl(): string {
  if (typeof window !== "undefined") {
    // Client-side: must use the public env var
    return process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000";
  }
  return getBackendApiUrl();
}

const API_URL = getApiUrl();

// --- Server-side (ISR) fetchers ---

export async function fetchPosts(
  page: number = 1,
  sort: string = "ranked",
  type?: string,
  tag?: string
): Promise<CommunityPostList | null> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      sort,
      per_page: "20",
    });
    if (type) params.set("type", type);
    if (tag) params.set("tag", tag);

    const res = await fetch(`${API_URL}/api/community/posts?${params}`, {
      cache: "no-store",
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
      cache: "no-store",
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
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchPostIdByArticle(
  articleId: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/community/by-article/${articleId}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.post_id;
  } catch {
    return null;
  }
}

// --- Client-side (auth-required) actions ---

export async function createPost(
  token: string,
  data: { type: string; title: string; url?: string; content?: string; tags?: string }
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

export async function deletePost(
  token: string,
  postId: string
): Promise<void> {
  const res = await fetch(`${API_URL}/api/community/posts/${postId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
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

// --- Notifications ---

export async function fetchNotifications(
  token: string,
  limit: number = 20,
  offset: number = 0
): Promise<Notification[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/notifications?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchUnreadCount(
  token: string
): Promise<number> {
  try {
    const res = await fetch(`${API_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.count;
  } catch {
    return 0;
  }
}

export async function markNotificationRead(
  token: string,
  notificationId: string
): Promise<void> {
  try {
    await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // silent — non-critical
  }
}

export async function markAllNotificationsRead(
  token: string
): Promise<void> {
  try {
    await fetch(`${API_URL}/api/notifications/read-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // silent — non-critical
  }
}
