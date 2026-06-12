import { expect, test } from "@playwright/test";

const smokeRoutes = [
  "/",
  "/openpawl",
  "/cloud",
  "/cloud/waitlist",
  "/cloud/evidence",
  "/products",
  "/pricing",
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
    await expect(page.getByText(/Openpawl v0\.5\.3\+ runs/i)).toBeVisible();
    await expect(
      page.getByText("Local preview only. Artifact contents are not uploaded or stored."),
    ).toBeVisible();
    await expect(page.getByText(/no artifact contents are sent to CodePawl servers/i)).toBeVisible();
    await expect(page.getByText(/Upcoming, waitlist-only/i)).toBeVisible();
    await expect(page.getByText(/CodePawl Cloud Evidence Hub is upcoming/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Join Cloud Evidence waitlist" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Request hosted evidence review" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tell us what workflow you need" })).toBeVisible();
  });

  test("/cloud and /cloud/waitlist keep upcoming and local-only copy", async ({ page }) => {
    await page.goto("/cloud");

    await expect(page.getByText(/CodePawl Cloud Evidence is upcoming/i)).toBeVisible();
    await expect(page.getByText(/no artifact contents are uploaded or stored/i)).toBeVisible();

    await page.goto("/cloud/waitlist");

    await expect(page.getByText(/CodePawl Cloud is not live/i)).toBeVisible();
    await expect(
      page.locator("p").filter({ hasText: /current artifact preview is local\/browser-only/i }),
    ).toBeVisible();
    await expect(page.getByText("GitHub org/repo type (optional)")).toBeVisible();
  });

  test("Marketplace webhook GET returns 405 and Allow POST", async ({ request }) => {
    const response = await request.get("/api/github/marketplace");

    expect(response.status()).toBe(405);
    expect(response.headers()["allow"]).toBe("POST");
  });
});
