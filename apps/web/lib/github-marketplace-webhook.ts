const JSON_HEADERS = {
  "Content-Type": "application/json",
} as const;

const SUPPORTED_MARKETPLACE_ACTIONS = new Set([
  "purchased",
  "changed",
  "cancelled",
  "pending_change",
  "pending_change_cancelled",
]);

export type MarketplaceWebhookResult = {
  status: string;
  event?: string;
  action?: string;
};

export async function handleGitHubMarketplaceWebhook(
  request: Request,
  secret: string | undefined,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: { code: "method_not_allowed", message: "Method not allowed." } }, 405, {
      Allow: "POST",
    });
  }

  if (!secret) {
    return json(
      {
        error: {
          code: "webhook_secret_not_configured",
          message: "Webhook secret is not configured.",
        },
      },
      500,
    );
  }

  if (!isJsonRequest(request)) {
    return json(
      {
        error: {
          code: "unsupported_media_type",
          message: "Content-Type must be application/json.",
        },
      },
      415,
    );
  }

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const signatureOk = await verifyGitHubSignature({
    body,
    secret,
    signature,
  });

  if (!signatureOk) {
    return json(
      {
        error: {
          code: "invalid_signature",
          message: "Invalid webhook signature.",
        },
      },
      401,
    );
  }

  const event = request.headers.get("x-github-event") ?? "";
  const delivery = request.headers.get("x-github-delivery") ?? undefined;
  let payload: unknown;

  try {
    payload = JSON.parse(body);
  } catch {
    return json(
      {
        error: {
          code: "invalid_json",
          message: "Request body must be valid JSON.",
        },
      },
      400,
    );
  }

  const action = getPayloadAction(payload);

  if (event !== "marketplace_purchase") {
    logWebhookReceived({ event, action, delivery, status: "ignored" });
    return json({ status: "ignored", event });
  }

  if (!action || !SUPPORTED_MARKETPLACE_ACTIONS.has(action)) {
    logWebhookReceived({ event, action, delivery, status: "ignored" });
    return json({ status: "ignored", event, action });
  }

  logWebhookReceived({ event, action, delivery, status: "ok" });
  return json({ status: "ok", event, action });
}

export async function verifyGitHubSignature(input: {
  body: string;
  secret: string;
  signature: string | null;
}): Promise<boolean> {
  const expectedPrefix = "sha256=";
  if (!input.signature?.startsWith(expectedPrefix)) return false;

  const signatureHex = input.signature.slice(expectedPrefix.length);
  if (!isLowerOrUpperHex(signatureHex) || signatureHex.length !== 64) return false;

  const expected = await hmacSha256Hex(input.secret, input.body);
  return constantTimeEqualHex(signatureHex, expected);
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return bytesToHex(new Uint8Array(signature));
}

function isJsonRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.toLowerCase().split(";")[0]?.trim() === "application/json";
}

function getPayloadAction(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || !("action" in payload)) return undefined;
  const action = (payload as { action?: unknown }).action;
  return typeof action === "string" ? action : undefined;
}

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: {
      ...JSON_HEADERS,
      ...headers,
    },
  });
}

function isLowerOrUpperHex(value: string): boolean {
  return /^[0-9a-fA-F]+$/.test(value);
}

function constantTimeEqualHex(a: string, b: string): boolean {
  const left = hexToBytes(a.toLowerCase());
  const right = hexToBytes(b.toLowerCase());
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i]! ^ right[i]!;
  }
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function logWebhookReceived(input: {
  event: string;
  action: string | undefined;
  delivery: string | undefined;
  status: string;
}): void {
  console.info("github_marketplace_webhook", {
    event: input.event,
    action: input.action,
    delivery: input.delivery,
    status: input.status,
  });
}
