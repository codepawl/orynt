import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { handleCloudWaitlistRequest, methodNotAllowed } from "../lib/cloud-waitlist";

const ORIGINAL_ENV = process.env;

function waitlistRequest(body: Record<string, unknown>, method = "POST"): Request {
  return new Request("https://codepawl.com/api/cloud/waitlist", {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
}

const validPayload = {
  email: "maintainer@example.com",
  roleUseCase: "Maintainer",
  workflowNeed: "review_openpawl_run_evidence",
  source: "cloud_waitlist_page",
  notes: "Need review workflow evidence only.",
};

describe("Cloud waitlist API", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env["RESEND_API_KEY"];
    delete process.env["RESEND_FROM"];
    delete process.env["WAITLIST_NOTIFY_TO"];
    delete process.env["RESEND_AUDIENCE_ID"];
    process.env["NODE_ENV"] = "development";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("returns Allow POST for unsupported methods", async () => {
    const response = methodNotAllowed();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "method_not_allowed" },
    });
  });

  test("skips Resend in development when email env is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleCloudWaitlistRequest(waitlistRequest(validPayload));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      emailStatus: "skipped_missing_env",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("fails closed in production when required email env is missing", async () => {
    process.env["NODE_ENV"] = "production";
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleCloudWaitlistRequest(waitlistRequest(validPayload));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "email_not_configured" },
    });
    expect(error).toHaveBeenCalledWith("cloud_waitlist_email_not_configured");
  });

  test("adds optional audience contact and sends notification plus confirmation", async () => {
    process.env["RESEND_API_KEY"] = "test-api-key";
    process.env["RESEND_FROM"] = "CodePawl <hello@example.com>";
    process.env["WAITLIST_NOTIFY_TO"] = "ops@example.com";
    process.env["RESEND_AUDIENCE_ID"] = "audience_123";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleCloudWaitlistRequest(waitlistRequest(validPayload));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "ok", emailStatus: "sent" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/audiences/audience_123/contacts");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.resend.com/emails");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("https://api.resend.com/emails");
  });

  test("keeps capture accepted when confirmation email fails after notification", async () => {
    process.env["RESEND_API_KEY"] = "test-api-key";
    process.env["RESEND_FROM"] = "CodePawl <hello@example.com>";
    process.env["WAITLIST_NOTIFY_TO"] = "ops@example.com";
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleCloudWaitlistRequest(waitlistRequest(validPayload));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      emailStatus: "accepted_with_email_warning",
    });
    expect(error).toHaveBeenCalledWith("cloud_waitlist_confirmation_email_failed");
  });

  test.each([
    [{ ...validPayload, email: "not-an-email" }, "A valid email is required."],
    [{ ...validPayload, workflowNeed: "" }, "Workflow need is required."],
    [{ ...validPayload, source: "unknown" }, "A valid waitlist source tag is required."],
    [{ ...validPayload, artifactContents: "artifact" }, "Artifact contents must not be submitted."],
  ])("rejects invalid payload %j", async (body, message) => {
    const response = await handleCloudWaitlistRequest(waitlistRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "validation_failed", message },
    });
  });

  test("accepts the Cloud status source tag", async () => {
    const response = await handleCloudWaitlistRequest(
      waitlistRequest({ ...validPayload, source: "cloud_status" }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      emailStatus: "skipped_missing_env",
    });
  });
});
