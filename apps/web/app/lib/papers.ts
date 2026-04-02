/**
 * Papers & Reproductions API client functions.
 */

import { getBackendApiUrl } from "@codepawl/shared";
import type { Paper, PaperList, Reproduction, ArxivMetadata } from "@codepawl/shared";

function getApiUrl(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000";
  }
  return getBackendApiUrl();
}

const API_URL = getApiUrl();

// --- Server-side (ISR) fetchers ---

export async function fetchPapers(
  page: number = 1,
  sort: string = "newest",
  status?: string,
  tag?: string,
  year?: number,
  q?: string,
): Promise<PaperList | null> {
  try {
    const params = new URLSearchParams({ page: String(page), sort, per_page: "20" });
    if (status) params.set("status", status);
    if (tag) params.set("tag", tag);
    if (year) params.set("year", String(year));
    if (q) params.set("q", q);

    const res = await fetch(`${API_URL}/api/papers?${params}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchPaper(id: string): Promise<Paper | null> {
  try {
    const res = await fetch(`${API_URL}/api/papers/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchReproductions(paperId: string): Promise<Reproduction[]> {
  try {
    const res = await fetch(`${API_URL}/api/papers/${paperId}/reproductions`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchRecentlyVerified(limit: number = 3): Promise<Paper[]> {
  try {
    const res = await fetch(`${API_URL}/api/papers/recently-verified?limit=${limit}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// --- Client-side (auth-required) actions ---

export async function fetchArxivMetadata(url: string): Promise<ArxivMetadata | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/papers/arxiv-metadata?url=${encodeURIComponent(url)}`,
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function createPaper(
  token: string,
  data: {
    title: string;
    authors?: string;
    arxiv_url?: string;
    pdf_url?: string;
    venue?: string;
    year?: number;
    abstract?: string;
    tags?: string;
  },
): Promise<Paper> {
  const res = await fetch(`${API_URL}/api/papers`, {
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

export async function createReproduction(
  token: string,
  paperId: string,
  data: {
    result: string;
    hardware?: string;
    framework?: string;
    model_tested?: string;
    summary: string;
    details?: string;
    code_url?: string;
    paper_claims?: Record<string, string>[];
    actual_results?: Record<string, string>[];
  },
): Promise<Reproduction> {
  const res = await fetch(`${API_URL}/api/papers/${paperId}/reproductions`, {
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

export async function deletePaper(token: string, paperId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/papers/${paperId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
}

export async function deleteReproduction(
  token: string,
  reproductionId: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/papers/reproductions/${reproductionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
}
