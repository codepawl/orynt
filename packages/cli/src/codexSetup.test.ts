import { describe, expect, it, vi } from "bun:test";

import {
  codexChildEnvironment,
  codexInstallGuidance,
  codexSecretLoginGuidance,
  codexSetupStatusJson,
  probeCodexEnvironment,
  probeCodexCli,
  runCodexSetup,
  type CodexExecFile,
  type CodexProviderStatus,
} from "./codexSetup";

function commandError(
  code: string | number,
  stderr = "",
): Error & { code: string | number; stderr: string } {
  return Object.assign(new Error(stderr || String(code)), { code, stderr });
}

function authenticatedStatus(
  overrides: Partial<CodexProviderStatus> = {},
): CodexProviderStatus {
  return {
    ready: true,
    code: "CODEX_READY",
    detail: "Logged in using ChatGPT · app-server ready",
    nextAction: "none",
    provider: "codex",
    transport: "app_server",
    version: "0.146.0",
    authenticated: true,
    dynamicTools: true,
    ...overrides,
  };
}

function authRequiredStatus(): CodexProviderStatus {
  return authenticatedStatus({
    ready: false,
    code: "CODEX_AUTH_REQUIRED",
    detail: "No authenticated Codex CLI session was detected.",
    nextAction: "login",
    authenticated: false,
    dynamicTools: false,
    remediationCommand: "orynt setup",
  });
}

describe("Codex readiness and setup", () => {
  it("preserves standard proxy settings without forwarding auth secrets", () => {
    const environment = codexChildEnvironment({
      PATH: "/usr/local/bin:/usr/bin",
      HTTP_PROXY: "http://proxy-user:proxy-password@proxy.example:8080",
      HTTPS_PROXY: "http://secure-proxy.example:8443",
      ALL_PROXY: "socks5://proxy.example:1080",
      NO_PROXY: "localhost,127.0.0.1",
      http_proxy: "http://lower-proxy.example:8080",
      https_proxy: "http://lower-secure-proxy.example:8443",
      all_proxy: "socks5://lower-proxy.example:1080",
      no_proxy: ".internal.example",
      OPENAI_API_KEY: "must-not-be-forwarded",
      CODEX_ACCESS_TOKEN: "must-not-be-forwarded",
      UNRELATED_VALUE: "must-not-be-forwarded",
    });

    expect(environment).toEqual({
      PATH: "/usr/local/bin:/usr/bin",
      HTTP_PROXY: "http://proxy-user:proxy-password@proxy.example:8080",
      HTTPS_PROXY: "http://secure-proxy.example:8443",
      ALL_PROXY: "socks5://proxy.example:1080",
      NO_PROXY: "localhost,127.0.0.1",
      http_proxy: "http://lower-proxy.example:8080",
      https_proxy: "http://lower-secure-proxy.example:8443",
      all_proxy: "socks5://lower-proxy.example:1080",
      no_proxy: ".internal.example",
    });
  });

  it("classifies missing, outdated, incompatible, and unauthenticated Codex", async () => {
    const missing = vi.fn(async () => {
      throw commandError("ENOENT");
    }) as unknown as CodexExecFile;
    await expect(probeCodexCli({ execFile: missing })).resolves.toMatchObject({
      code: "CODEX_CLI_MISSING",
      nextAction: "install",
    });

    const outdated = vi.fn(async () => ({
      stdout: "codex-cli 0.145.0",
      stderr: "",
    })) as unknown as CodexExecFile;
    await expect(probeCodexCli({ execFile: outdated })).resolves.toMatchObject({
      code: "CODEX_CLI_OUTDATED",
      version: "0.145.0",
    });

    const incompatible = vi.fn()
      .mockResolvedValueOnce({ stdout: "codex-cli 0.146.0", stderr: "" })
      .mockResolvedValueOnce({ stdout: "app-server help", stderr: "" }) as unknown as CodexExecFile;
    await expect(probeCodexCli({ execFile: incompatible })).resolves.toMatchObject({
      code: "CODEX_APP_SERVER_UNAVAILABLE",
    });

    const unauthenticated = vi.fn()
      .mockResolvedValueOnce({ stdout: "codex-cli 0.146.0", stderr: "" })
      .mockResolvedValueOnce({ stdout: "--stdio", stderr: "" })
      .mockRejectedValueOnce(commandError(1, "Not logged in")) as unknown as CodexExecFile;
    await expect(probeCodexCli({ execFile: unauthenticated })).resolves.toMatchObject({
      code: "CODEX_AUTH_REQUIRED",
      nextAction: "login",
    });

    const stagedUnauthenticated = vi.fn()
      .mockResolvedValueOnce({ stdout: "codex-cli 0.146.0", stderr: "" })
      .mockResolvedValueOnce({ stdout: "--stdio", stderr: "" })
      .mockRejectedValueOnce(commandError(1, "Not logged in")) as unknown as CodexExecFile;
    await expect(
      probeCodexEnvironment({ execFile: stagedUnauthenticated }),
    ).resolves.toMatchObject({
      status: { code: "CODEX_AUTH_REQUIRED" },
      stages: [
        { id: "cli", status: "pass" },
        { id: "app_server", status: "pass" },
        {
          id: "authentication",
          status: "fail",
          remediation: { command: "orynt setup" },
        },
      ],
    });
  });

  it("accepts harmless stderr warnings and sanitizes bounded status output", async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ stdout: "codex-cli 0.146.0", stderr: "" })
      .mockResolvedValueOnce({ stdout: "--stdio", stderr: "" })
      .mockResolvedValueOnce({
        stdout: "Logged in using ChatGPT",
        stderr: "warning\u001b[2J",
      }) as unknown as CodexExecFile;
    const status = await probeCodexCli({ execFile: run });
    expect(status).toMatchObject({
      ready: true,
      code: "CODEX_READY",
      authenticated: true,
    });
    expect(status.detail).toContain("warning[2J");
    expect(status.detail).not.toContain("\u001b");
  });

  it("runs browser and device login with exact argv, then rechecks", async () => {
    for (const [choice, argv] of [
      ["browser", ["login"]],
      ["device", ["login", "--device-auth"]],
    ] as const) {
      const probe = vi.fn()
        .mockResolvedValueOnce(authRequiredStatus())
        .mockResolvedValueOnce(authenticatedStatus());
      const runExternal = vi.fn(async () => ({ exitCode: 0 }));
      const result = await runCodexSetup({
        isTTY: true,
        write: vi.fn(),
        select: vi.fn(async () => choice),
        probe,
        runExternal,
      });
      expect(result.outcome).toBe("ready");
      expect(runExternal).toHaveBeenCalledWith("codex", [...argv]);
      expect(probe).toHaveBeenCalledTimes(2);
    }
  });

  it("never reads or pipes API-key and access-token values", async () => {
    for (const choice of ["apiKey", "accessToken"] as const) {
      const output: string[] = [];
      const runExternal = vi.fn();
      const selections = [choice, "exit"];
      const result = await runCodexSetup({
        isTTY: true,
        platform: "linux",
        write: (value) => output.push(value),
        select: vi.fn(async () => selections.shift() ?? "exit"),
        probe: vi.fn(async () => authRequiredStatus()),
        runExternal,
      });
      expect(result.outcome).toBe("manual_action_required");
      expect(runExternal).not.toHaveBeenCalled();
      expect(output.join("\n")).toContain(
        choice === "apiKey" ? "OPENAI_API_KEY" : "CODEX_ACCESS_TOKEN",
      );
    }
  });

  it("requires confirmation before updating and re-probes after success", async () => {
    const outdated = authenticatedStatus({
      ready: false,
      code: "CODEX_CLI_OUTDATED",
      detail: "Codex is outdated.",
      nextAction: "update",
      authenticated: false,
      dynamicTools: false,
    });
    const probe = vi.fn()
      .mockResolvedValueOnce(outdated)
      .mockResolvedValueOnce(authenticatedStatus());
    const runExternal = vi.fn(async () => ({ exitCode: 0 }));
    const result = await runCodexSetup({
      isTTY: true,
      write: vi.fn(),
      select: vi.fn(async () => "update"),
      confirm: vi.fn(async () => true),
      probe,
      runExternal,
    });
    expect(result.outcome).toBe("ready");
    expect(runExternal).toHaveBeenCalledWith(
      "codex",
      ["update"],
      { timeoutMs: 120_000 },
    );
  });

  it("returns manual guidance for missing installs without running commands", async () => {
    const output: string[] = [];
    const runExternal = vi.fn();
    const result = await runCodexSetup({
      isTTY: true,
      platform: "win32",
      write: (value) => output.push(value),
      select: vi.fn(),
      probe: vi.fn(async () =>
        authenticatedStatus({
          ready: false,
          code: "CODEX_CLI_MISSING",
          detail: "missing",
          nextAction: "install",
          authenticated: false,
          dynamicTools: false,
        })
      ),
      runExternal,
    });
    expect(result.outcome).toBe("manual_action_required");
    expect(output.join("\n")).toContain("install.ps1");
    expect(runExternal).not.toHaveBeenCalled();
  });

  it("renders platform guidance and a stable machine status", () => {
    expect(codexInstallGuidance("darwin").join("\n")).toContain("brew install");
    expect(codexInstallGuidance("linux").join("\n")).toContain("install.sh");
    expect(codexSecretLoginGuidance("apiKey", "win32").join("\n"))
      .toContain("$env:OPENAI_API_KEY");
    expect(JSON.parse(codexSetupStatusJson(authRequiredStatus()))).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        kind: "codex_setup_status",
        ready: false,
        code: "CODEX_AUTH_REQUIRED",
        nextAction: "login",
      }),
    );
  });
});
