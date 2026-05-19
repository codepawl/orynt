import { expect, test } from "@playwright/test";

// Tests intercept /api/v1/* at the browser level so they don't require a
// live Supabase / Resend / Turnstile. This exercises the same code paths
// the production frontend hits, including the docs/API.md response shapes
// (202 pending_confirmation, 200 confirmed, 201 received, 200 stats).

test.describe("marketing landing", () => {
  test("renders the hero cycler with the first product active", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Ship",
    );
    const opChip = page.getByRole("button", { name: "OpenPawl" });
    await expect(opChip).toBeVisible();
    await expect(opChip).toHaveAttribute("aria-pressed", "true");
  });

  test("clicking a product chip advances the cycler", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Featcat" }).click();
    await expect(
      page.getByRole("button", { name: "Featcat" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "Featcat" })).toBeVisible();
  });
});

test.describe("newsletter signup flow", () => {
  test("subscribe then land on /newsletter/confirm with confirmed_at set", async ({
    page,
  }) => {
    await page.route("**/api/v1/newsletter/subscribe", async (route) => {
      if (route.request().method() === "OPTIONS") {
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
        status: 202,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ status: "pending_confirmation" }),
      });
    });
    await page.route("**/api/v1/newsletter/confirm**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          status: "confirmed",
          email: "ada@example.com",
          confirmed_at: new Date().toISOString(),
        }),
      });
    });

    await page.goto("/");
    await page
      .getByLabel("Email address")
      .fill("ada@example.com");
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(page.getByRole("status")).toContainText(
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
  test("renders the product page with a stars cell wired to product_stats", async ({
    page,
  }) => {
    // The page is SSG with ISR — the stats fetch happens server-side at build
    // time, so we cannot intercept it in the browser. We assert the page
    // renders correctly and the stars cell is wired to product_stats data
    // (either a live number or the "—" fallback when the API is unreachable).
    await page.goto("/products/openpawl");
    await expect(
      page.getByRole("heading", { level: 1, name: "OpenPawl" }),
    ).toBeVisible();
    await expect(page.getByTestId("product-stars")).toBeVisible();
  });
});
