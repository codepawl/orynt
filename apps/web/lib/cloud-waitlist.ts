const JSON_HEADERS = {
  "Content-Type": "application/json",
} as const;

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const RESEND_AUDIENCE_CONTACT_URL = "https://api.resend.com/audiences";

export const CLOUD_WAITLIST_SOURCE_TAGS = new Set([
  "cloud_page_primary",
  "cloud_page_secondary",
  "cloud_waitlist_page",
  "cloud_evidence_demo",
  "cloud_status",
  "artifact_preview_feedback",
  "pricing_cloud",
  "nav_cloud_waitlist",
  "home_cloud_waitlist",
  "manual",
]);

export type CloudWaitlistPayload = {
  email: string;
  roleUseCase: string;
  workflowNeed: string;
  source: string;
  notes?: string;
};

type WaitlistEnv = {
  resendApiKey?: string;
  resendFrom?: string;
  notifyTo?: string;
  audienceId?: string;
  nodeEnv?: string;
};

type EmailSendResult =
  | "sent"
  | "skipped_missing_env"
  | "accepted_with_email_warning";

export type CloudWaitlistResponse = {
  status: "ok";
  emailStatus: EmailSendResult;
};

export async function handleCloudWaitlistRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed();
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

  const payload = validatePayload(await request.json().catch(() => null));
  if (!payload.ok) {
    return json(
      {
        error: {
          code: "validation_failed",
          message: payload.message,
        },
      },
      400,
    );
  }

  const env = readWaitlistEnv();
  if (isProductionMissingEmailEnv(env)) {
    console.error("cloud_waitlist_email_not_configured");
    return json(
      {
        error: {
          code: "email_not_configured",
          message: "Waitlist email is not configured.",
        },
      },
      500,
    );
  }

  const emailStatus = await sendWaitlistEmails(payload.value, env);

  return json({
    status: "ok",
    emailStatus,
  } satisfies CloudWaitlistResponse, 202);
}

export function methodNotAllowed(): Response {
  return json(
    {
      error: {
        code: "method_not_allowed",
        message: "Method not allowed.",
      },
    },
    405,
    { Allow: "POST" },
  );
}

export async function sendWaitlistEmails(
  payload: CloudWaitlistPayload,
  env: WaitlistEnv,
): Promise<EmailSendResult> {
  const requiredEnv = [env.resendApiKey, env.resendFrom, env.notifyTo];
  if (requiredEnv.some((value) => !value)) {
    return "skipped_missing_env";
  }

  try {
    if (env.audienceId) {
      await addAudienceContact(payload, env);
    }

    await sendInternalNotification(payload, env);
  } catch {
    console.error("cloud_waitlist_capture_email_failed");
    return "accepted_with_email_warning";
  }

  try {
    await sendUserConfirmation(payload, env);
  } catch {
    console.error("cloud_waitlist_confirmation_email_failed");
    return "accepted_with_email_warning";
  }

  return "sent";
}

function readWaitlistEnv(): WaitlistEnv {
  return {
    resendApiKey: process.env["RESEND_API_KEY"],
    resendFrom: process.env["RESEND_FROM"],
    notifyTo: process.env["WAITLIST_NOTIFY_TO"],
    audienceId: process.env["RESEND_AUDIENCE_ID"],
    nodeEnv: process.env["NODE_ENV"],
  };
}

function isProductionMissingEmailEnv(env: WaitlistEnv): boolean {
  return env.nodeEnv === "production" && [env.resendApiKey, env.resendFrom, env.notifyTo].some((value) => !value);
}

async function addAudienceContact(payload: CloudWaitlistPayload, env: WaitlistEnv): Promise<void> {
  await resendFetch(`${RESEND_AUDIENCE_CONTACT_URL}/${env.audienceId}/contacts`, env, {
    email: payload.email,
    first_name: "",
    last_name: "",
    unsubscribed: false,
  });
}

async function sendInternalNotification(
  payload: CloudWaitlistPayload,
  env: WaitlistEnv,
): Promise<void> {
  await resendFetch(RESEND_EMAILS_URL, env, {
    from: env.resendFrom,
    to: [env.notifyTo],
    subject: "New CodePawl Cloud Evidence waitlist request",
    text: buildInternalNotificationText(payload),
    html: paragraphHtml(buildInternalNotificationText(payload)),
  });
}

async function sendUserConfirmation(
  payload: CloudWaitlistPayload,
  env: WaitlistEnv,
): Promise<void> {
  await resendFetch(RESEND_EMAILS_URL, env, {
    from: env.resendFrom,
    to: [payload.email],
    subject: "You are on the CodePawl Cloud Evidence waitlist",
    text: buildUserConfirmationText(),
    html: paragraphHtml(buildUserConfirmationText()),
  });
}

async function resendFetch(url: string, env: WaitlistEnv, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("resend_request_failed");
  }
}

function validatePayload(input: unknown):
  | { ok: true; value: CloudWaitlistPayload }
  | { ok: false; message: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const payload = input as Record<string, unknown>;
  const email = normalizeString(payload["email"]);
  const roleUseCase = normalizeString(payload["roleUseCase"]);
  const workflowNeed = normalizeString(payload["workflowNeed"]);
  const source = normalizeString(payload["source"]);
  const notes = normalizeString(payload["notes"]);
  const artifactContents = normalizeString(payload["artifactContents"]);

  if (!email || !isEmail(email)) {
    return { ok: false, message: "A valid email is required." };
  }
  if (!roleUseCase) {
    return { ok: false, message: "Role or use case is required." };
  }
  if (!workflowNeed) {
    return { ok: false, message: "Workflow need is required." };
  }
  if (!source || !CLOUD_WAITLIST_SOURCE_TAGS.has(source)) {
    return { ok: false, message: "A valid waitlist source tag is required." };
  }
  if (artifactContents) {
    return { ok: false, message: "Artifact contents must not be submitted." };
  }

  return {
    ok: true,
    value: {
      email,
      roleUseCase: roleUseCase.slice(0, 160),
      workflowNeed: workflowNeed.slice(0, 240),
      source,
      notes: notes ? notes.slice(0, 1000) : undefined,
    },
  };
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isJsonRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.toLowerCase().split(";")[0]?.trim() === "application/json";
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

function buildInternalNotificationText(payload: CloudWaitlistPayload): string {
  return [
    "New CodePawl Cloud Evidence waitlist request",
    "",
    `Email: ${payload.email}`,
    `Role/use case: ${payload.roleUseCase}`,
    `Workflow need: ${payload.workflowNeed}`,
    `Source: ${payload.source}`,
    `Notes: ${payload.notes || "None"}`,
    "",
    "Reminder: do not ask for artifact contents, source code, prompts, traces, credentials, logs, or secrets through this waitlist flow.",
  ].join("\n");
}

function buildUserConfirmationText(): string {
  return [
    "You are on the CodePawl Cloud Evidence waitlist.",
    "",
    "CodePawl Cloud is upcoming and not generally available yet. The current Cloud Evidence preview is local/browser-only: artifact contents are not uploaded or stored by CodePawl.",
    "",
    "We will follow up when early hosted review conversations open. Please do not send artifact contents, source code, prompts, traces, credentials, logs, or secrets by email.",
    "",
    "CodePawl",
    "https://codepawl.com/cloud",
  ].join("\n");
}

function paragraphHtml(text: string): string {
  return text
    .split("\n\n")
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
