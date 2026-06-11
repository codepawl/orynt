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
    await expect(
      page.locator("#main").getByText("DEVELOPING").first(),
    ).toBeVisible();
    await expect(
      page.locator("#main").getByText("COMING SOON").first(),
    ).toBeVisible();
  });

  test("customer journey cards update the problem detail", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "The problem is not writing code. It is operating agent work.",
      }),
    ).toBeVisible();
    const journeyDetail = page.locator("#customer-journey-detail");
    await expect(
      journeyDetail.getByText("TracePawl / failure diagnosis"),
    ).toBeVisible();

    await expect(page.getByTestId("customer-journey")).toHaveAttribute(
      "data-hydrated",
      "true",
    );
    await page.getByRole("tab", { name: /Preserve context/ }).click();
    await expect(
      journeyDetail.getByText("Mempawl / persistent operational memory"),
    ).toBeVisible();
    await expect(
      journeyDetail.getByText("agents forget previous failures"),
    ).toBeVisible();
  });

  test("product cards preserve real product routes", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "View product", exact: true }).first(),
    ).toHaveAttribute("href", "/products/trace");
    await expect(
      page
        .locator('a[href="/products/cachepawl"]')
        .filter({ hasText: "Early access" })
        .first(),
    ).toHaveAttribute("href", "/products/cachepawl");
  });

  test("hero CTA links to products", async ({ page }) => {
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

    await page.route("**/api/v1/newsletter/confirm**", async (route) => {
      if (!route.request().url().includes("token=fake-token")) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "confirmed",
          email: "ada@example.com",
          confirmed_at: "2026-06-03T00:00:00.000Z",
        }),
      });
    });

    await page.goto("/");
    const footerForm = page.locator('footer form[data-hydrated="true"]').first();
    await footerForm.waitFor();
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

    await page.goto("/newsletter/confirm?token=fake-token", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(/on the list/i)).toBeVisible();
    await expect(page.getByText(/ada@example.com/)).toBeVisible();
  });

  test("header exposes product selector and product state labels", async ({
    page,
  }) => {
    await page.goto("/");
    const primaryNav = page.getByRole("navigation", { name: "Primary" });
    await expect(primaryNav.getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      "/openpawl/docs",
    );
    await expect(primaryNav.getByRole("link", { name: "Support" })).toHaveAttribute(
      "href",
      "/openpawl/support",
    );
    await expect(primaryNav.getByRole("link", { name: "Status" })).toHaveAttribute(
      "href",
      "/status",
    );
    await expect(primaryNav.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "/contact",
    );
    await primaryNav.getByRole("link", { name: /Products/ }).hover();
    await expect(
      primaryNav.getByText("Products"),
    ).toBeVisible();
    await expect(
      primaryNav.getByRole("link", { name: /TracePawl/ }),
    ).toHaveAttribute("href", "/products/trace");
    await expect(primaryNav.getByText("DEVELOPING").first()).toBeVisible();
    await expect(primaryNav.getByText("COMING SOON").first()).toBeVisible();
    await expect(
      primaryNav.getByRole("link", { name: /CachePawl/ }),
    ).toHaveAttribute("href", "/products/cachepawl");
    await expect(
      page.getByRole("link", { name: "GitHub Follow @codepawl" }),
    ).toHaveAttribute("href", "https://github.com/codepawl");
  });

  test("footer groups products, resources, company, and legal links", async ({
    page,
  }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByText("products", { exact: true })).toBeVisible();
    await expect(footer.getByText("resources", { exact: true })).toBeVisible();
    await expect(footer.getByText("company", { exact: true })).toBeVisible();
    await expect(footer.getByText("legal", { exact: true })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Openpawl Docs" })).toHaveAttribute(
      "href",
      "/openpawl/docs",
    );
    await expect(footer.getByRole("link", { name: "Openpawl Support" })).toHaveAttribute(
      "href",
      "/openpawl/support",
    );
    await expect(footer.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "/contact",
    );
    await expect(footer.getByRole("link", { name: "CachePawl" })).toHaveAttribute(
      "href",
      "/products/cachepawl",
    );
    await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
    await expect(footer.getByRole("link", { name: "Security" })).toHaveAttribute(
      "href",
      "/security",
    );
  });
});

test.describe("Marketplace-critical routes", () => {
  const routes = [
    { path: "/openpawl/install", heading: /Install Openpawl/ },
    { path: "/openpawl/docs", heading: /Openpawl documentation/ },
    { path: "/openpawl/support", heading: /Support for Openpawl/ },
    { path: "/status", heading: /Public status/ },
    { path: "/privacy", heading: /Privacy policy/ },
    { path: "/terms", heading: /Terms/ },
    { path: "/security", heading: /Security reporting/ },
  ] as const;

  for (const route of routes) {
    test(`${route.path} returns a real page`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        route.heading,
      );
      await expect(page.locator("#main").getByText("v0.5.1")).toHaveCount(0);
    });
  }

  test("webhook GET remains method-not-allowed", async ({ request }) => {
    const response = await request.get("/api/github/marketplace");
    expect(response.status()).toBe(405);
    expect(response.headers()["allow"]).toBe("POST");
  });

  test("Marketplace copy avoids live-listing and Cloud availability claims", async ({
    page,
  }) => {
    await page.goto("/status");
    await expect(page.getByText("does not claim that a GitHub Marketplace listing is live")).toBeVisible();
    await expect(page.getByText("CodePawl Cloud is upcoming and waitlist-only")).toBeVisible();
  });
});

test.describe("contact form", () => {
  test("shows direct contact email and X profile", async ({ page }) => {
    await page.goto("/contact");
    await expect(
      page.locator("#main").getByRole("link", { name: "founder@codepawl.com" }),
    ).toHaveAttribute("href", "mailto:founder@codepawl.com");
    await expect(
      page.locator("#main").getByRole("link", { name: "@codepawl", exact: true }),
    ).toHaveAttribute("href", "https://x.com/codepawl");
  });

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
    await expect(page.locator("#main").getByText("DEVELOPING")).toBeVisible();
    await expect(page.getByTestId("product-stars")).toBeVisible();
  });

  test("renders announced-soon pages with GitHub early access", async ({
    page,
  }) => {
    await page.goto("/products/mempawl");
    await expect(
      page.getByRole("heading", { level: 1, name: "Mempawl" }),
    ).toBeVisible();
    await expect(
      page.locator("#main").getByText("COMING SOON"),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Get early access on GitHub" }),
    ).toHaveAttribute("href", "https://github.com/codepawl/mempawl");
    await expect(page.getByText("Install")).toHaveCount(0);
    await expect(page.getByTestId("product-stars")).toHaveCount(0);
  });

  test("product and docs indexes expose availability labels", async ({
    page,
  }) => {
    await page.goto("/products");
    await expect(page.locator("#main").getByText("DEVELOPING")).toBeVisible();
    await expect(
      page.locator("#main").getByText("COMING SOON").first(),
    ).toBeVisible();

    await page.goto("/docs");
    await expect(page.locator("#main").getByText("DEVELOPING")).toBeVisible();
    await expect(
      page.locator("#main").getByText("COMING SOON").first(),
    ).toBeVisible();
  });
});
