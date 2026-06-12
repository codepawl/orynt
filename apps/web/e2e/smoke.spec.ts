import { expect, test } from "@playwright/test";

const smokeRoutes = [
  "/",
  "/openpawl",
  "/cloud/evidence",
  "/openpawl/install",
  "/openpawl/docs",
  "/openpawl/support",
  "/status",
  "/privacy",
  "/terms",
  "/security",
] as const;

test.describe("CodePawl web smoke", () => {
  for (const route of smokeRoutes) {
    test(`${route} returns a page`, async ({ page }) => {
      const response = await page.goto(route);

      expect(response?.status()).toBe(200);
      await expect(page.locator("#main")).toBeVisible();
    });
  }

  test("homepage keeps the current positioning", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "CodePawl makes coding agents work together",
    );
  });

  test("/cloud/evidence keeps local preview and no-upload copy", async ({ page }) => {
    await page.goto("/cloud/evidence");

    await expect(page.getByText("browser-only preview")).toBeVisible();
    await expect(
      page.getByText("Local preview only. Artifact contents are not uploaded or stored."),
    ).toBeVisible();
    await expect(page.getByText(/no artifact contents are sent to CodePawl servers/i)).toBeVisible();
    await expect(page.getByText(/Upcoming, waitlist-only/i)).toBeVisible();
    await expect(page.getByText(/CodePawl Cloud Evidence Hub is upcoming/i)).toBeVisible();
  });
});
