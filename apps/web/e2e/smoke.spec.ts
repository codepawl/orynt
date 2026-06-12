import { expect, test } from "@playwright/test";

const smokeRoutes = [
  "/",
  "/openpawl",
  "/cloud",
  "/cloud/status",
  "/cloud/waitlist",
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
    await expect(page.getByText(/Openpawl v0\.5\.3\+ runs/i)).toBeVisible();
    await expect(
      page.getByText("Local preview only. Artifact contents are not uploaded or stored."),
    ).toBeVisible();
    await expect(page.getByText(/no artifact contents are sent to CodePawl servers/i)).toBeVisible();
    await expect(page.getByText(/Upcoming, waitlist-only/i)).toBeVisible();
    await expect(page.getByText(/CodePawl Cloud Evidence Hub is upcoming/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Join Cloud waitlist" })).toHaveAttribute(
      "href",
      "/cloud/waitlist?source=cloud_evidence_demo",
    );
  });

  test("/cloud/status keeps roadmap and availability copy clear", async ({ page }) => {
    await page.goto("/cloud/status");

    await expect(page.getByRole("heading", { name: "Cloud Evidence status and roadmap" })).toBeVisible();
    await expect(
      page.getByText(/Track what is live, what is local-only/i),
    ).toBeVisible();
    await expect(page.getByText(/Waitlist and Resend email are live/i)).toBeVisible();
    await expect(page.getByText(/Hosted review is upcoming/i)).toBeVisible();
    await expect(page.getByText(/hosted artifact storage is not enabled/i)).toBeVisible();
    await expect(page.getByText(/not an uptime page, SLA, or production availability claim/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Resend email flow", exact: true })).toBeVisible();
    await expect(page.getByText("Reviewer inbox for OpenPawl run evidence")).toBeVisible();
    await expect(page.getByText("Persistent evidence records with explicit consent")).toBeVisible();
    await expect(page.getByText("Status/incident history after Cloud beta is real")).toBeVisible();
    await expect(page.getByText("Hosted review intake planned")).toBeVisible();
    await expect(page.getByRole("link", { name: "Cloud overview" }).first()).toHaveAttribute(
      "href",
      "/cloud",
    );
    await expect(page.getByRole("link", { name: "X @codepawl" })).toHaveAttribute(
      "href",
      "https://x.com/codepawl",
    );
    await expect(page.getByRole("link", { name: "Threads @codepawl" })).toHaveAttribute(
      "href",
      "https://www.threads.com/@codepawl?igshid=NTc4MTIwNjQ2YQ==",
    );
    await expect(page.getByRole("link", { name: "Evidence Hub", exact: true })).toHaveAttribute(
      "href",
      "/cloud/evidence",
    );
  });

  test("/cloud waitlist captures source-tagged form submissions", async ({ page }) => {
    await page.route("**/api/cloud/waitlist", async (route) => {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", emailStatus: "sent" }),
      });
    });

    await page.goto("/cloud/waitlist?source=cloud_evidence_demo");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("smoke@example.com");
    await page.getByLabel("Role or use case").fill("Platform engineer");
    await page.getByLabel("Workflow need").selectOption("review_openpawl_run_evidence");
    await page.getByLabel("Optional notes").fill("Smoke test only; no artifacts.");
    await page.getByRole("button", { name: "Join Cloud Evidence waitlist" }).click();

    await expect(page.getByText(/Check your inbox for confirmation/i)).toBeVisible();
  });

  test("GitHub Marketplace webhook rejects GET with Allow POST", async ({ request }) => {
    const response = await request.get("/api/github/marketplace");

    expect(response.status()).toBe(405);
    expect(response.headers()["allow"]).toBe("POST");
  });
});
