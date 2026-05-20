/**
 * Shared API response shapes. Hand-written in Phase 1; later phases may
 * generate from `/openapi.json` (see docs/API.md "OpenAPI doc").
 */

export type ProductStatus = "stable" | "beta" | "alpha" | "pre-alpha" | "private";

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly tagline: string;
  readonly status: ProductStatus;
  readonly github_repo: string;
  readonly display_order: number;
}

export interface ProductStats {
  readonly product_id: string;
  readonly stars: number;
  readonly forks: number;
  readonly open_issues: number;
  readonly last_release_tag: string | null;
  readonly last_release_at: string | null;
  readonly synced_at: string;
}

export interface NewsletterSubscribeRequest {
  readonly email: string;
  readonly source: string;
  readonly turnstile_token: string;
}

export interface ContactSubmitRequest {
  readonly name: string;
  readonly email: string;
  readonly subject?: string;
  readonly message: string;
  readonly turnstile_token: string;
}

export interface ApiError {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: ReadonlyArray<{ readonly field: string; readonly issue: string }>;
  };
}
