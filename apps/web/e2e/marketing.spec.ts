import { expect, test } from "@playwright/test";

test.describe("marketing landing", () => {
  test("renders the modernist landing sections with real stack data", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "AI agent products",
    );
    await expect(
      page.getByRole("heading", { name: "A focused toolkit" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "TracePawl" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "CachePawl" }),
    ).toBeVisible();
    await expect(page.getByText("pre-alpha").first()).toBeVisible();
  });

  test("product cards preserve real product routes", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "View product", exact: true }).first(),
    ).toHaveAttribute("href", "/products/trace");
    await expect(
      page.getByRole("link", { name: "View product", exact: true }).nth(3),
    ).toHaveAttribute("href", "/products/cachepawl");
  });

  test("hero CTA links to the stack", async ({ page }) => {
    await page.goto("/");
    const cta = page.getByRole("link", { name: "Browse products" }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/products");
  });

  test("newsletter signup flow subscribes from the footer", async ({ page }) => {
    await page.route("**/api/v1/newsletter/subscribe", async (route) => {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          status: "pending_confirmation",
          token: "fake-token",
        }),
      });
    });

    await page.route(
      "**/api/v1/newsletter/confirm?token=fake-token",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "confirmed",
            email: "ada@example.com",
            confirmed_at: "2026-06-03T00:00:00.000Z",
          }),
        });
      },
    );

    await page.goto("/");
    const footerForm = page.locator("footer form").first();
    await footerForm.getByLabel("Email address").fill("ada@example.com");
    const subscribeRequest = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().includes("/api/v1/newsletter/subscribe"),
    );
    await footerForm.getByRole("button", { name: "Subscribe" }).click();
    await subscribeRequest;
    await expect(footerForm.getByRole("status")).toContainText(
      "Check your inbox to confirm.",
    );

    await page.goto("/newsletter/confirm?token=fake-token");
    await expect(page.getByText(/on the list/i)).toBeVisible();
    await expect(page.getByText(/ada@example.com/)).toBeVisible();
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
    const form = page.locator('form[data-hydrated="true"]').first();
    await form.waitFor();
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
    // SSG with ISR -- stats fetch happens server-side at build time; we cannot
    // intercept in the browser. Assert the page renders and the stars cell is
    // wired (live number or "--" fallback when API unreachable).
    await page.goto("/products/trace");
    await expect(
      page.getByRole("heading", { level: 1, name: "TracePawl" }),
    ).toBeVisible();
    await expect(page.getByTestId("product-stars")).toBeVisible();
  });
});
