import type { CloudWaitlistPayload } from "./cloud-waitlist";

const SITE_URL = "https://codepawl.com";
const LOGO_URL = `${SITE_URL}/logo_for_light_mode.svg`;
const CLOUD_URL = `${SITE_URL}/cloud`;
const WAITLIST_URL = `${SITE_URL}/cloud/waitlist`;
const EVIDENCE_URL = `${SITE_URL}/cloud/evidence`;
const X_URL = "https://x.com/codepawl";
const THREADS_URL = "https://www.threads.com/@codepawl?igshid=NTc4MTIwNjQ2YQ==";

export type WaitlistEmail = {
  subject: string;
  text: string;
  html: string;
};

export function buildUserConfirmationEmail(): WaitlistEmail {
  const subject = "You’re on the Cloud Evidence waitlist";
  const text = [
    "You’re on the Cloud Evidence waitlist",
    "",
    "Thanks for joining. CodePawl Cloud Evidence is upcoming and not generally available yet. We will follow up when early hosted review conversations open.",
    "",
    "You can try the current Evidence Hub preview in your browser:",
    EVIDENCE_URL,
    "",
    "Privacy note: the current preview is local/browser-only. Artifact contents are not uploaded or stored by CodePawl. Please do not send artifact contents, source code, prompts, traces, credentials, logs, or secrets by email.",
    "",
    `Cloud Evidence: ${CLOUD_URL}`,
    `Waitlist: ${WAITLIST_URL}`,
    `X: ${X_URL}`,
    `Threads: ${THREADS_URL}`,
  ].join("\n");

  const html = renderEmailShell({
    eyebrow: "Cloud Evidence waitlist",
    title: "You’re on the Cloud Evidence waitlist",
    preview:
      "Thanks for joining. CodePawl Cloud Evidence is upcoming and not generally available yet.",
    body: [
      paragraph(
        "Thanks for joining. CodePawl Cloud Evidence is upcoming and not generally available yet. We will follow up when early hosted review conversations open.",
      ),
      button("Open browser-only Evidence Hub", EVIDENCE_URL),
      callout(
        "Privacy note",
        "The current preview is local/browser-only. Artifact contents are not uploaded or stored by CodePawl. Please do not send artifact contents, source code, prompts, traces, credentials, logs, or secrets by email.",
      ),
      linkList([
        ["Cloud Evidence", CLOUD_URL],
        ["Waitlist", WAITLIST_URL],
        ["X @codepawl", X_URL],
        ["Threads @codepawl", THREADS_URL],
      ]),
    ],
  });

  return { subject, text, html };
}

export function buildInternalNotificationEmail(
  payload: CloudWaitlistPayload,
  timestamp = new Date(),
): WaitlistEmail {
  const submittedAt = timestamp.toISOString();
  const subject = "New CodePawl Cloud Evidence waitlist request";
  const fields = [
    ["Email", payload.email],
    ["Role/use case", payload.roleUseCase],
    ["Workflow need", payload.workflowNeed],
    ["Source", payload.source],
    ["Notes", payload.notes || "None"],
    ["Timestamp", submittedAt],
  ] as const;

  const text = [
    "New CodePawl Cloud Evidence waitlist request",
    "",
    ...fields.map(([label, value]) => `${label}: ${value}`),
    "",
    "Safety warning: do not request artifact contents, source code, prompts, traces, credentials, logs, or secrets through this waitlist flow.",
  ].join("\n");

  const html = renderEmailShell({
    eyebrow: "Internal notification",
    title: "New Cloud Evidence waitlist request",
    preview: "A new CodePawl Cloud Evidence waitlist request was submitted.",
    body: [
      table(fields),
      callout(
        "Safety warning",
        "Do not request artifact contents, source code, prompts, traces, credentials, logs, or secrets through this waitlist flow.",
      ),
    ],
  });

  return { subject, text, html };
}

function renderEmailShell({
  eyebrow,
  title,
  preview,
  body,
}: {
  eyebrow: string;
  title: string;
  preview: string;
  body: string[];
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f7f3ec;color:#1d1b18;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f3ec;width:100%;">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffaf2;border:2px solid #1d1b18;box-shadow:6px 6px 0 #1d1b18;">
            <tr>
              <td style="padding:24px 24px 16px;border-bottom:2px solid #1d1b18;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${LOGO_URL}" width="40" height="40" alt="CodePawl" style="display:block;border:0;">
                    </td>
                    <td style="vertical-align:middle;padding-left:12px;">
                      <div style="font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#6b6358;font-weight:700;">${escapeHtml(eyebrow)}</div>
                      <div style="font-size:18px;line-height:24px;font-weight:800;color:#1d1b18;">CodePawl</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 8px;">
                <h1 style="margin:0;font-size:30px;line-height:36px;color:#1d1b18;font-weight:800;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 28px;">
                ${body.join("\n")}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px;border-top:2px solid #1d1b18;background:#1d1b18;color:#fffaf2;font-size:13px;line-height:20px;">
                CodePawl Cloud Evidence is upcoming and waitlist-only.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function paragraph(value: string): string {
  return `<p style="margin:0 0 18px;font-size:16px;line-height:24px;color:#2f2a24;">${escapeHtml(value)}</p>`;
}

function button(label: string, href: string): string {
  return `<p style="margin:22px 0;"><a href="${escapeAttribute(href)}" style="display:inline-block;background:#da3f1f;color:#fffaf2;text-decoration:none;font-size:15px;line-height:20px;font-weight:800;border:2px solid #1d1b18;padding:12px 16px;">${escapeHtml(label)}</a></p>`;
}

function callout(title: string, value: string): string {
  return `<div style="margin:20px 0;padding:16px;border:2px solid #1d1b18;background:#f7f3ec;">
  <div style="font-size:13px;line-height:18px;letter-spacing:1.5px;text-transform:uppercase;color:#6b6358;font-weight:800;">${escapeHtml(title)}</div>
  <p style="margin:8px 0 0;font-size:15px;line-height:22px;color:#2f2a24;">${escapeHtml(value)}</p>
</div>`;
}

function linkList(links: Array<[string, string]>): string {
  const items = links
    .map(
      ([label, href]) =>
        `<li style="margin:0 0 8px;"><a href="${escapeAttribute(href)}" style="color:#b73319;font-weight:700;text-decoration:underline;">${escapeHtml(label)}</a></li>`,
    )
    .join("");

  return `<div style="margin-top:22px;">
  <div style="font-size:13px;line-height:18px;letter-spacing:1.5px;text-transform:uppercase;color:#6b6358;font-weight:800;">Helpful links</div>
  <ul style="margin:10px 0 0;padding-left:20px;font-size:15px;line-height:22px;color:#2f2a24;">${items}</ul>
</div>`;
}

function table(rows: ReadonlyArray<readonly [string, string]>): string {
  const body = rows
    .map(
      ([label, value]) => `<tr>
  <th align="left" style="width:170px;padding:10px 12px;border-bottom:1px solid #d8d0c3;font-size:13px;line-height:18px;color:#6b6358;text-transform:uppercase;letter-spacing:1px;vertical-align:top;">${escapeHtml(label)}</th>
  <td style="padding:10px 12px;border-bottom:1px solid #d8d0c3;font-size:15px;line-height:22px;color:#1d1b18;vertical-align:top;white-space:pre-wrap;">${escapeHtml(value)}</td>
</tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 20px;width:100%;border:2px solid #1d1b18;background:#fffdf8;border-collapse:collapse;">${body}</table>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
