import { describe, it, expect } from "vitest";
import { KARMA_THRESHOLDS, CATEGORIES, ROLES, ARTICLE_STATUSES } from "@codepawl/shared";

describe("@codepawl/shared constants", () => {
  it("exports correct karma thresholds", () => {
    expect(KARMA_THRESHOLDS.DOWNVOTE).toBe(50);
    expect(KARMA_THRESHOLDS.FLAG).toBe(100);
  });

  it("exports 15 categories", () => {
    expect(CATEGORIES).toHaveLength(15);
    expect(CATEGORIES).toContain("llm");
    expect(CATEGORIES).toContain("general");
  });

  it("exports roles", () => {
    expect(ROLES).toContain("user");
    expect(ROLES).toContain("admin");
  });

  it("exports article statuses", () => {
    expect(ARTICLE_STATUSES).toContain("published");
    expect(ARTICLE_STATUSES).toContain("draft");
  });
});
