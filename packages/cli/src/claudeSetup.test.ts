import { describe, expect, it } from "bun:test";

import {
  claudeAntAuthGuidance,
  claudeApiKeyGuidance,
  claudeSetupStatusJson,
  probeClaudeCli,
  probeClaudeEnvironment,
  runClaudeSetup,
  type ClaudeExecFile,
  type ClaudeSetupDependencies,
} from "./claudeSetup";

const SECRET = "sk-ant-api03-SECRETVALUE0123456789";

function okFetch(status = 200, body = "{}"): typeof fetch {
  return (async () =>
    new Response(body, { status })) as unknown as typeof fetch;
}

describe("claude environment probe", () => {
  it("reports a missing credential without inventing one", async () => {
    const probe = await probeClaudeEnvironment({ env: {} });
    expect(probe.status.ready).toBe(false);
    expect(probe.status.code).toBe("CLAUDE_AUTH_REQUIRED");
    expect(probe.status.nextAction).toBe("configure");
    expect(probe.stages).toHaveLength(1);
    expect(probe.stages[0]!.evidence.apiKeyPresent).toBe(false);
  });

  it("fails fast when both credential variables are set", async () => {
    const probe = await probeClaudeEnvironment({
      env: { ANTHROPIC_API_KEY: SECRET, ANTHROPIC_AUTH_TOKEN: "oat-1" },
    });
    expect(probe.status.code).toBe("CLAUDE_CREDENTIAL_CONFLICT");
    // The API rejects a request carrying both, so the probe must not proceed.
    expect(probe.stages).toHaveLength(1);
  });

  it("passes when the API accepts the key", async () => {
    const probe = await probeClaudeEnvironment({
      env: { ANTHROPIC_API_KEY: SECRET },
      fetchImpl: okFetch(),
    });
    expect(probe.status.ready).toBe(true);
    expect(probe.status.code).toBe("CLAUDE_READY");
    expect(probe.status.authenticated).toBe(true);
  });

  it("maps 401 to an invalid credential", async () => {
    const probe = await probeClaudeEnvironment({
      env: { ANTHROPIC_API_KEY: SECRET },
      fetchImpl: okFetch(401, '{"error":{"message":"bad key"}}'),
    });
    expect(probe.status.code).toBe("CLAUDE_AUTH_INVALID");
    expect(probe.status.ready).toBe(false);
  });

  it("maps 403 to a model-access failure", async () => {
    const probe = await probeClaudeEnvironment({
      env: { ANTHROPIC_API_KEY: SECRET },
      fetchImpl: okFetch(403),
    });
    expect(probe.status.code).toBe("CLAUDE_MODEL_ACCESS_DENIED");
  });

  it("treats a rate limit as authenticated rather than broken", async () => {
    const probe = await probeClaudeEnvironment({
      env: { ANTHROPIC_API_KEY: SECRET },
      fetchImpl: okFetch(429),
    });
    expect(probe.status.code).toBe("CLAUDE_RATE_LIMITED");
    expect(probe.status.authenticated).toBe(true);
    expect(probe.status.ready).toBe(true);
  });

  it("reports an unreachable API without leaking the request", async () => {
    const probe = await probeClaudeEnvironment({
      env: { ANTHROPIC_API_KEY: SECRET },
      fetchImpl: (async () => {
        throw new Error("getaddrinfo ENOTFOUND api.anthropic.com");
      }) as unknown as typeof fetch,
    });
    expect(probe.status.code).toBe("CLAUDE_PROBE_FAILED");
    expect(JSON.stringify(probe)).not.toContain("SECRETVALUE");
  });

  it("sends the key as x-api-key and the token as a bearer", async () => {
    const seen: Record<string, string>[] = [];
    const capture = (async (_url: string, init: RequestInit) => {
      seen.push({ ...(init.headers as Record<string, string>) });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await probeClaudeEnvironment({
      env: { ANTHROPIC_API_KEY: SECRET },
      fetchImpl: capture,
    });
    await probeClaudeEnvironment({
      env: { ANTHROPIC_AUTH_TOKEN: "oat-1" },
      fetchImpl: capture,
    });
    expect(seen[0]!["x-api-key"]).toBe(SECRET);
    expect(seen[0]).not.toHaveProperty("authorization");
    expect(seen[1]!.authorization).toBe("Bearer oat-1");
    expect(seen[1]!["anthropic-beta"]).toBe("oauth-2025-04-20");
  });
});

describe("claude setup never handles the secret", () => {
  it("records only the variable name in probe evidence", async () => {
    const probe = await probeClaudeEnvironment({
      env: { ANTHROPIC_API_KEY: SECRET },
      fetchImpl: okFetch(),
    });
    const serialized = JSON.stringify(probe);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain("SECRETVALUE");
    expect(serialized).toContain("ANTHROPIC_API_KEY");
  });

  it("keeps the secret out of every byte the setup flow writes", async () => {
    const written: string[] = [];
    const dependencies: ClaudeSetupDependencies = {
      isTTY: false,
      platform: "linux",
      env: { ANTHROPIC_API_KEY: SECRET },
      fetchImpl: okFetch(401, `{"error":{"message":"rejected ${SECRET}"}}`),
      write: (value) => written.push(value),
    };
    const result = await runClaudeSetup(dependencies);
    expect(result.outcome).toBe("manual_action_required");
    expect(written.join("")).not.toContain("SECRETVALUE");
  });

  it("emits a status document that carries no credential value", async () => {
    const probe = await probeClaudeEnvironment({
      env: { ANTHROPIC_API_KEY: SECRET },
      fetchImpl: okFetch(401, `{"error":{"message":"bad ${SECRET}"}}`),
    });
    const json = claudeSetupStatusJson(probe.status);
    expect(json).not.toContain("sk-ant-");
    expect(JSON.parse(json)).toMatchObject({
      schemaVersion: 1,
      kind: "claude_setup_status",
      ready: false,
      code: "CLAUDE_AUTH_INVALID",
    });
  });

  it("offers no prompt that could accept a key", () => {
    const guidance = [
      ...claudeApiKeyGuidance("ANTHROPIC_API_KEY", "linux"),
      ...claudeAntAuthGuidance(),
    ].join("\n");
    expect(guidance).toContain("so Orynt never receives the secret");
    expect(guidance).toContain("only the variable name");
    expect(guidance).toContain("ant auth print-credentials --access-token");
  });

  it("uses PowerShell syntax on Windows", () => {
    expect(claudeApiKeyGuidance("ANTHROPIC_API_KEY", "win32")[1]).toContain(
      "$env:ANTHROPIC_API_KEY",
    );
  });
});

function execFile(
  responses: Record<string, { stdout?: string; stderr?: string } | Error>,
): ClaudeExecFile {
  return async (_executable, argv) => {
    const key = argv.join(" ");
    const response = responses[key];
    if (!response) throw Object.assign(new Error(`no stub for ${key}`), {});
    if (response instanceof Error) throw response;
    return response;
  };
}

describe("claude cli probe (track B)", () => {
  it("reports a missing binary as install work", async () => {
    const probe = await probeClaudeCli({
      execFile: execFile({
        "--version": Object.assign(new Error("spawn claude ENOENT"), {
          code: "ENOENT",
        }),
      }),
    });
    expect(probe.status.code).toBe("CLAUDE_CLI_MISSING");
    expect(probe.status.nextAction).toBe("install");
    expect(probe.stages).toHaveLength(1);
  });

  it("feature-detects the bidirectional stream protocol", async () => {
    // Orynt drives the CLI over stream-json stdio, so a build without the flag
    // is unusable regardless of its version string.
    const probe = await probeClaudeCli({
      execFile: execFile({
        "--version": { stdout: "2.1.200" },
        "-p --help": { stdout: "--output-format  --print" },
      }),
    });
    expect(probe.status.code).toBe("CLAUDE_STREAM_PROTOCOL_UNAVAILABLE");
    expect(probe.status.nextAction).toBe("update");
  });

  it("requires a signed-in CLI and delegates the login", async () => {
    const probe = await probeClaudeCli({
      execFile: execFile({
        "--version": { stdout: "2.1.220" },
        "-p --help": { stdout: "--input-format stream-json" },
        "auth status": Object.assign(new Error("not logged in"), { code: 1 }),
      }),
    });
    expect(probe.status.code).toBe("CLAUDE_AUTH_REQUIRED");
    expect(probe.status.remediationCommand).toBe("claude auth login");
    // Orynt must never run the login itself.
    expect(probe.stages.at(-1)!.remediation!.command).toBeNull();
  });

  it("passes when the CLI is installed, current and signed in", async () => {
    const probe = await probeClaudeCli({
      execFile: execFile({
        "--version": { stdout: "2.1.220" },
        "-p --help": { stdout: "--input-format stream-json" },
        "auth status": { stdout: '{"authenticated":true}' },
      }),
    });
    expect(probe.status.ready).toBe(true);
    expect(probe.status.code).toBe("CLAUDE_READY");
    expect(probe.stages.map((stage) => stage.id)).toEqual([
      "cli",
      "stream_protocol",
      "authentication",
    ]);
  });

  it("reports the stdio transport, not the Messages API default", async () => {
    const stubs = {
      "--version": { stdout: "2.1.226" },
      "-p --help": { stdout: "--input-format stream-json" },
    };
    const ready = await probeClaudeCli({
      execFile: execFile({ ...stubs, "auth status": { stdout: "{}" } }),
    });
    const unauthenticated = await probeClaudeCli({
      execFile: execFile({
        ...stubs,
        "auth status": Object.assign(new Error("no"), { code: 1 }),
      }),
    });
    // Diagnostics must not describe the CLI route as the HTTP one.
    expect(ready.status.transport).toBe("stdio");
    expect(unauthenticated.status.transport).toBe("stdio");
  });
});

describe("claude setup flow", () => {
  it("returns ready without prompting when the probe already passes", async () => {
    const written: string[] = [];
    const result = await runClaudeSetup({
      isTTY: true,
      env: { ANTHROPIC_API_KEY: SECRET },
      fetchImpl: okFetch(),
      write: (value) => written.push(value),
      confirm: async () => {
        throw new Error("must not prompt when already ready");
      },
    });
    expect(result.outcome).toBe("ready");
    expect(result.status.code).toBe("CLAUDE_READY");
  });

  it("never prompts in a non-interactive shell", async () => {
    const result = await runClaudeSetup({
      isTTY: false,
      env: {},
      write: () => undefined,
      confirm: async () => {
        throw new Error("must not prompt without a TTY");
      },
    });
    expect(result.outcome).toBe("manual_action_required");
  });

  it("rechecks after the operator sets the variable", async () => {
    let attempt = 0;
    const env: NodeJS.ProcessEnv = {};
    const result = await runClaudeSetup({
      isTTY: true,
      env,
      fetchImpl: okFetch(),
      write: () => undefined,
      confirm: async () => {
        attempt += 1;
        env.ANTHROPIC_API_KEY = SECRET;
        return true;
      },
    });
    expect(attempt).toBe(1);
    expect(result.outcome).toBe("ready");
  });

  it("stops when the operator declines to recheck", async () => {
    const result = await runClaudeSetup({
      isTTY: true,
      env: {},
      write: () => undefined,
      confirm: async () => false,
    });
    expect(result.outcome).toBe("cancelled");
  });
});
