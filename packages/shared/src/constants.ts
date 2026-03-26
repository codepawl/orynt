/**
 * Shared constants for CodePawl.
 */

// User roles
export const ROLES = ["user", "admin"] as const;

// Article status values
export const ARTICLE_STATUSES = [
  "draft",
  "review",
  "published",
  "rejected",
  "archived",
] as const;

// API error codes
export const API_ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

// 14 AI/ML categories (13 taxonomy tags + general for feeds)
export const CATEGORIES = [
  "general",
  "llm",
  "computer-vision",
  "nlp",
  "rag",
  "mlops",
  "agents",
  "training",
  "open-source",
  "research",
  "hardware",
  "safety",
  "multimodal",
  "data",
  "robotics",
] as const;

export type Category = (typeof CATEGORIES)[number];
