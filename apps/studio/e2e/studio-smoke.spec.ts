import { expect, test } from "@playwright/test";

test("Studio runtime renders full-page report-driven app without design reference cards", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page.getByText(".codex/ui/mockup-light-theme.html")).toHaveCount(0);
  await expect(page.getByText(".codex/ui/mockup-dark-theme.html")).toHaveCount(0);
  await expect(page.getByText(".codex/ui/wireframe-light-theme.html")).toHaveCount(0);
  await expect(page.getByText(".codex/ui/wireframe-dark-theme.html")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /CodePawl Studio/ })).toBeVisible();
  await expect(page.getByText("Local-only").first()).toBeVisible();
  await expect(page.getByText("No source upload by default").first()).toBeVisible();
  await expect(page.getByText("Report Data Source")).toBeVisible();
  await expect(page.getByText("Rendering generated CodePawl report JSON through the Studio adapter.")).toBeVisible();
  await expect(page.getByText("Most Urgent Decision")).toBeVisible();
  await expect(page.getByText("Weekly AI Shipping Funnel")).toBeVisible();
  await expect(page.locator(".screen")).toHaveCSS("border-radius", "0px");

  const screenBox = await page.locator(".screen").boundingBox();
  const viewport = page.viewportSize();
  expect(screenBox?.x).toBe(0);
  expect(screenBox?.y).toBe(0);
  expect(Math.round(screenBox?.width ?? 0)).toBe(viewport?.width);
  await expect(page.locator(".nav-item .chip").first()).toHaveCSS("min-height", "22px");
  await expect(page.locator(".btn").first()).toHaveCSS("min-height", "36px");
  await expect(page.locator(".attention-lead .card-actions")).toHaveCSS("gap", "10px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport?.width ?? 0);

  await page.screenshot({
    path: testInfo.outputPath("studio-overview.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Open session detail" }).click();
  await expect(page.getByRole("heading", { name: /Codex - Synthetic UI change missing e2e evidence/ })).toBeVisible();
  await expect(page.getByText("Evidence Audit Trail")).toBeVisible();
  await expect(page.getByText("Recommended Action").first()).toBeVisible();
  await expect(page.getByText("Memory Candidate")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("studio-session-detail.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Responsive Report Review" }).click();
  await expect(page.getByRole("heading", { name: /Responsive Report Review/ })).toBeVisible();
  await expect(page.getByText("Mobile report review")).toBeVisible();
  await expect(page.getByText("Tablet report review")).toBeVisible();
  await expect(page.getByText("Desktop report review")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("studio-responsive-report-review.png"),
    fullPage: true,
  });
});
