import { expect, test } from "@playwright/test";

test.describe("marketing landing", () => {
  test("renders the CodePawl hero", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "CodePawl",
    );
    await expect(
      page
        .getByRole("region", { name: "CodePawl introduction" })
        .getByText("Infrastructure for autonomous coding agents."),
    ).toBeVisible();
  });

  test("hero CTA links to TracePawl", async ({ page }) => {
    await page.goto("/");
    const cta = page.getByRole("link", { name: "View TracePawl" });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/products/trace");
  });

  test("stack section renders all four products with TracePawl marked current focus", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 3, name: "TracePawl" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Mempawl" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "OpenPawl" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "CachePawl" }),
    ).toBeVisible();
    await expect(page.getByText("current focus").first()).toBeVisible();
  });
});

test.describe("contact form", () => {
  test("submits and shows success when API returns 201", async ({ page }) => {
    await page.route("**/api/v1/contact", async (route) => {
      const method = route.request().method();
      if (method === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          status: "received",
          id: "00000000-0000-0000-0000-000000000001",
        }),
      });
    });

    await page.goto("/contact");
    const form = page.locator("form").first();
    await form.getByLabel("Name").fill("Ada Lovelace");
    await form.getByLabel("Email", { exact: true }).fill("ada@example.com");
    await form
      .getByLabel("Message")
      .fill("A reasonably long message to satisfy the 10-char minimum.");
    const requestPromise = page.waitForRequest(
      (req) =>
        req.method() === "POST" && req.url().includes("/api/v1/contact"),
    );
    await page.getByRole("button", { name: "Send message" }).click();
    const request = await requestPromise;
    expect(request.postDataJSON()).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    await expect(page.getByText(/Thanks/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("product detail", () => {
  test("renders the TracePawl page with a stars cell wired to product_stats", async ({
    page,
  }) => {
    // SSG with ISR — stats fetch happens server-side at build time; we cannot
    // intercept in the browser. Assert the page renders and the stars cell is
    // wired (live number or "—" fallback when API unreachable).
    await page.goto("/products/trace");
    await expect(
      page.getByRole("heading", { level: 1, name: "TracePawl" }),
    ).toBeVisible();
    await expect(page.getByTestId("product-stars")).toBeVisible();
  });
});
