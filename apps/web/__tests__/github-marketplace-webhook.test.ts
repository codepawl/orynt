import { describe, expect, test, vi } from "vitest";

import {
  handleGitHubMarketplaceWebhook,
  hmacSha256Hex,
  verifyGitHubSignature,
} from "../lib/github-marketplace-webhook";

const SECRET = "It's a Secret to Everybody";

async function signedRequest(input: {
  body: string;
  secret?: string;
  event?: string;
  method?: string;
  contentType?: string;
  signature?: string;
}): Promise<Request> {
  const signature =
    input.signature ??
    `sha256=${await hmacSha256Hex(input.secret ?? SECRET, input.body)}`;

  return new Request("https://codepawl.com/api/github/marketplace", {
    method: input.method ?? "POST",
    body: input.method === "GET" ? undefined : input.body,
    headers: {
      "Content-Type": input.contentType ?? "application/json",
      "X-GitHub-Event": input.event ?? "marketplace_purchase",
      "X-GitHub-Delivery": "delivery-1",
      "X-Hub-Signature-256": signature,
    },
  });
}

describe("GitHub Marketplace webhook", () => {
  test("matches GitHub's documented HMAC SHA-256 test vector", async () => {
    await expect(hmacSha256Hex(SECRET, "Hello, World!")).resolves.toBe(
      "757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
    );
    await expect(
      verifyGitHubSignature({
        body: "Hello, World!",
        secret: SECRET,
        signature: "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
      }),
    ).resolves.toBe(true);
  });

  test("returns 200 for a valid marketplace_purchase payload", async () => {
    const body = JSON.stringify({
      action: "purchased",
      effective_date: "2026-06-11T00:00:00Z",
      marketplace_purchase: {
        account: { id: 1, login: "octocat" },
        plan: { id: 10, name: "Free" },
      },
      sender: { login: "octocat" },
    });
    const request = await signedRequest({ body });

    const response = await handleGitHubMarketplaceWebhook(request, SECRET);

    await expect(response.json()).resolves.toEqual({
      status: "ok",
      event: "marketplace_purchase",
      action: "purchased",
    });
    expect(response.status).toBe(200);
  });

  test.each([
    "purchased",
    "changed",
    "cancelled",
    "pending_change",
    "pending_change_cancelled",
  ])("returns 200 for marketplace_purchase action %s", async (action) => {
    const body = JSON.stringify({ action, marketplace_purchase: {}, sender: {} });
    const request = await signedRequest({ body });

    const response = await handleGitHubMarketplaceWebhook(request, SECRET);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      event: "marketplace_purchase",
      action,
    });
  });

  test("rejects invalid signatures", async () => {
    const body = JSON.stringify({ action: "purchased" });
    const request = await signedRequest({
      body,
      signature: "sha256=0000000000000000000000000000000000000000000000000000000000000000",
    });

    const response = await handleGitHubMarketplaceWebhook(request, SECRET);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_signature" },
    });
  });

  test("rejects unsupported methods", async () => {
    const request = await signedRequest({
      body: JSON.stringify({ action: "purchased" }),
      method: "GET",
    });

    const response = await handleGitHubMarketplaceWebhook(request, SECRET);

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "method_not_allowed" },
    });
  });

  test("keeps logs minimal for valid events", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const body = JSON.stringify({ action: "changed", marketplace_purchase: {}, sender: {} });
    const request = await signedRequest({ body });

    await handleGitHubMarketplaceWebhook(request, SECRET);

    expect(info).toHaveBeenCalledWith("github_marketplace_webhook", {
      event: "marketplace_purchase",
      action: "changed",
      delivery: "delivery-1",
      status: "ok",
    });
    info.mockRestore();
  });
});
