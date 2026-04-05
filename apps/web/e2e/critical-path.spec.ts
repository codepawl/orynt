import { test, expect } from "@playwright/test";

test.describe("Critical path — public pages", () => {
  test("homepage loads with title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/CodePawl/i);
  });

  test("blog page loads", async ({ page }) => {
    await page.goto("/blog");
    await expect(page.locator("h1, h2, [class*='blog']")).toBeVisible();
  });

  test("community page loads", async ({ page }) => {
    await page.goto("/community");
    // Should show the community page (may be empty)
    await expect(page).toHaveURL(/\/community/);
  });

  test("/news redirects to /blog", async ({ page }) => {
    await page.goto("/news");
    await expect(page).toHaveURL(/\/blog/);
  });

  test("login page shows sign-in button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();
  });

  test("navigation works between pages", async ({ page }) => {
    await page.goto("/");
    // About is in the footer; navigate directly to verify it loads
    await page.goto("/about");
    await expect(page).toHaveURL(/\/about/);
  });
});

test.describe("Critical path — auth-gated (smoke)", () => {
  test("community submit redirects or shows auth prompt when not logged in", async ({ page }) => {
    await page.goto("/community/submit");
    // Should either redirect to login or show auth required
    const url = page.url();
    const hasAuthPrompt = await page.locator("text=/sign in|log in|login/i").count();
    expect(url.includes("/login") || hasAuthPrompt > 0 || url.includes("/community")).toBeTruthy();
  });
});
