import { describe, expect, it, vi } from "bun:test";

import {
  opencodeSetupStatusJson,
  probeOpencodeEnvironment,
  runOpencodeSetup,
} from "./opencodeSetup";

const OK = () =>
  new Response(JSON.stringify({ object: "list", data: [] }), { status: 200 });

describe("OpenCode readiness probe", () => {
  it("reports a missing credential without making a request", async () => {
    const fetchImpl = vi.fn();
    const status = await probeOpencodeEnvironment({ env: {}, fetchImpl });

    expect(status).toMatchObject({
      ready: false,
      provider: "opencode",
      code: "OPENCODE_AUTH_REQUIRED",
      nextAction: "configure",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("authenticates with x-api-key, the header the runtime will send", async () => {
    const fetchImpl = vi.fn(async () => OK());
    const status = await probeOpencodeEnvironment({
      env: { OPENCODE_API_KEY: "test-key" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: "https://gateway.test/",
    });

    expect(status.ready).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    // The bearer route is a different API shape; probing it would pass while
    // the Messages route the runtime uses still rejects the credential.
    expect(url).toBe("https://gateway.test/v1/models");
    expect((init as RequestInit).headers).toEqual({ "x-api-key": "test-key" });
  });

  it("separates a rejected credential from an unreachable service", async () => {
    const rejected = await probeOpencodeEnvironment({
      env: { OPENCODE_API_KEY: "bad" },
      fetchImpl: (async () => new Response("", { status: 401 })) as typeof fetch,
    });
    const broken = await probeOpencodeEnvironment({
      env: { OPENCODE_API_KEY: "ok" },
      fetchImpl: (async () => {
        throw new Error("connect ECONNREFUSED");
      }) as typeof fetch,
    });

    expect(rejected).toMatchObject({
      code: "OPENCODE_AUTH_INVALID",
      nextAction: "configure",
    });
    expect(broken).toMatchObject({
      code: "OPENCODE_PROBE_FAILED",
      nextAction: "diagnose",
    });
  });

  it("never puts the credential value in its JSON status", async () => {
    const status = await probeOpencodeEnvironment({
      env: { OPENCODE_API_KEY: "super-secret-value" },
      fetchImpl: (async () => OK()) as typeof fetch,
    });

    expect(opencodeSetupStatusJson(status)).not.toContain("super-secret-value");
  });
});

describe("OpenCode setup flow", () => {
  it("prints guidance and stops when the host cannot prompt", async () => {
    const lines: string[] = [];
    const result = await runOpencodeSetup({
      isTTY: false,
      write: (value) => lines.push(value),
      probe: async () => ({
        ready: false,
        provider: "opencode",
        transport: "http",
        code: "OPENCODE_AUTH_REQUIRED",
        detail: "OPENCODE_API_KEY is not set.",
        nextAction: "configure",
      }),
    });

    expect(result.outcome).toBe("manual_action_required");
    // There is deliberately no code path that accepts a secret.
    expect(lines.join("\n")).toContain('export OPENCODE_API_KEY="<your key>"');
  });
});
