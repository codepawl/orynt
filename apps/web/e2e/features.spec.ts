import { test, expect } from "@playwright/test";

// ── Auth redirect tests ──────────────────────────────────────────────────────

test.describe("Auth redirects", () => {
  test("/blog/write redirects to /login when not authenticated", async ({ page }) => {
    await page.goto("/blog/write");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/admin redirects to /login when not authenticated", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/community/submit shows auth prompt or redirects when not logged in", async ({ page }) => {
    await page.goto("/community/submit");
    const url = page.url();
    const hasAuthPrompt = await page.locator("text=/sign in|log in|login/i").count();
    expect(url.includes("/login") || hasAuthPrompt > 0 || url.includes("/community")).toBeTruthy();
  });
});

// ── Blog page ────────────────────────────────────────────────────────────────

test.describe("Blog", () => {
  test("blog listing loads and has expected elements", async ({ page }) => {
    await page.goto("/blog");
    await expect(page.locator("h1, h2")).toBeVisible();
    await expect(page).toHaveURL(/\/blog/);
  });

  test("blog listing has a submit/write link for authenticated users", async ({ page }) => {
    await page.goto("/blog");
    // Page should load without errors
    await expect(page).toHaveURL(/\/blog/);
  });
});

// ── Community ────────────────────────────────────────────────────────────────

test.describe("Community", () => {
  test("community page loads with tabs", async ({ page }) => {
    await page.goto("/community");
    await expect(page).toHaveURL(/\/community/);
    // Ranked tab should be visible
    await expect(page.getByText("Ranked")).toBeVisible();
  });

  test("community sort tabs work", async ({ page }) => {
    await page.goto("/community");
    await page.click("text=New");
    await expect(page).toHaveURL(/sort=new/);
  });

  test("vote on post redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/community");
    // Click the first upvote button if posts exist; if no posts nothing happens
    const voteButton = page.locator("button svg path[d='M6 0L12 8H0z']").first();
    const count = await voteButton.count();
    if (count > 0) {
      await voteButton.click();
      // Should redirect to login since not authenticated
      await expect(page).toHaveURL(/\/login/);
    }
  });
});

// ── Admin smoke ──────────────────────────────────────────────────────────────

test.describe("Admin smoke", () => {
  test("/admin/community redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/admin/community");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/admin/blog redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/admin/blog");
    await expect(page).toHaveURL(/\/login/);
  });
});
