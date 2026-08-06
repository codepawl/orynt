import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { redactSensitivePayload } from "@codepawl/shared";

import type { ComposerChoice } from "./composer.js";
import type {
  CodexNextAction,
  CodexProviderCode,
  ProviderStatus,
} from "./session.js";

const execFileAsync = promisify(execFile);
const MINIMUM_CODEX_VERSION = "0.146.0";
const MAX_DIAGNOSTIC_LENGTH = 2_000;

export type { CodexNextAction, CodexProviderCode };

export type CodexProviderStatus = ProviderStatus & {
  code: CodexProviderCode;
  nextAction: CodexNextAction;
  remediationCommand?: string;
};

export type CodexProbeStage = {
  id: "cli" | "app_server" | "authentication";
  label: string;
  status: "pass" | "fail";
  summary: string;
  evidence: Record<string, string | number | boolean | null>;
  cause: string | null;
  remediation: {
    description: string;
    command: string | null;
  } | null;
  durationMs: number;
};

export type CodexEnvironmentProbe = {
  status: CodexProviderStatus;
  stages: CodexProbeStage[];
};

export type CodexSetupOutcome =
  | "ready"
  | "cancelled"
  | "manual_action_required"
  | "failed";

export type CodexSetupResult = {
  outcome: CodexSetupOutcome;
  status: CodexProviderStatus;
};

export type CodexCommandResult = {
  exitCode: number | null;
  signal?: NodeJS.Signals | null;
};

export type CodexExecFile = (
  executable: string,
  argv: string[],
  options: {
    timeout: number;
    maxBuffer: number;
  },
) => Promise<{
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}>;

export type CodexSetupDependencies = {
  isTTY: boolean;
  platform?: NodeJS.Platform;
  initialStatus?: CodexProviderStatus;
  write(value: string): void;
  select?: (
    prompt: string,
    choices: ComposerChoice[],
    currentValue?: string,
  ) => Promise<string>;
  confirm?: (prompt: string) => Promise<boolean>;
  probe?: () => Promise<CodexProviderStatus>;
  runExternal?: (
    executable: string,
    argv: string[],
    options?: { timeoutMs?: number },
  ) => Promise<CodexCommandResult>;
};

export function codexChildEnvironment(
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const allowedNames = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SystemRoot",
    "ComSpec",
    "PATHEXT",
    "WINDIR",
    "LOCALAPPDATA",
    "APPDATA",
    "USERPROFILE",
    "CODEX_HOME",
    "CODEX_CA_CERTIFICATE",
    "SSL_CERT_FILE",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TERM",
    "COLORTERM",
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "DBUS_SESSION_BUS_ADDRESS",
    "BROWSER",
  ] as const;
  return Object.fromEntries(
    allowedNames.flatMap((name) => {
      const value = sourceEnvironment[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

type CommandError = Error & {
  code?: string | number;
  signal?: NodeJS.Signals;
  killed?: boolean;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
};

function cleanDiagnostic(value: unknown, fallback: string): string {
  const text =
    typeof value === "string" || Buffer.isBuffer(value)
      ? String(value)
      : fallback;
  const redacted = redactSensitivePayload(text).payload;
  const safe = (typeof redacted === "string" ? redacted : fallback)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_DIAGNOSTIC_LENGTH);
  return safe || fallback;
}

function errorText(error: unknown, fallback: string): string {
  const commandError = error as CommandError;
  return cleanDiagnostic(
    `${commandError?.stdout ?? ""} ${commandError?.stderr ?? ""} ${
      error instanceof Error ? error.message : String(error ?? "")
    }`,
    fallback,
  );
}

function isMissingExecutable(error: unknown): boolean {
  return (error as CommandError)?.code === "ENOENT";
}

function isCommandExit(error: unknown): boolean {
  return typeof (error as CommandError)?.code === "number";
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function baseStatus(
  input: Pick<
    CodexProviderStatus,
    "code" | "detail" | "nextAction" | "ready"
  > &
    Partial<CodexProviderStatus>,
): CodexProviderStatus {
  return {
    provider: "codex",
    transport: "app_server",
    authenticated: false,
    dynamicTools: false,
    ...input,
  };
}

export async function probeCodexCli(
  dependencies: { execFile?: CodexExecFile } = {},
): Promise<CodexProviderStatus> {
  return (await probeCodexEnvironment(dependencies)).status;
}

export async function probeCodexEnvironment(
  dependencies: { execFile?: CodexExecFile; now?: () => number } = {},
): Promise<CodexEnvironmentProbe> {
  const run = dependencies.execFile ?? (execFileAsync as CodexExecFile);
  const now = dependencies.now ?? performance.now.bind(performance);
  const stages: CodexProbeStage[] = [];
  const duration = (startedAt: number) =>
    Math.max(0, Math.round(now() - startedAt));
  const failedStage = (
    id: CodexProbeStage["id"],
    label: string,
    summary: string,
    cause: string,
    command: string | null,
    startedAt: number,
    evidence: CodexProbeStage["evidence"] = {},
  ): CodexProbeStage => ({
    id,
    label,
    status: "fail",
    summary,
    evidence,
    cause,
    remediation: {
      description:
        id === "authentication"
          ? "Authenticate Codex through Orynt setup, then rerun doctor."
          : "Repair or update the Codex CLI, then rerun doctor.",
      command,
    },
    durationMs: duration(startedAt),
  });
  let version = "";
  const cliStarted = now();
  try {
    const result = await run("codex", ["--version"], {
      timeout: 15_000,
      maxBuffer: 512_000,
    });
    version =
      String(result.stdout ?? "").match(/\b(\d+\.\d+\.\d+)\b/u)?.[1] ?? "";
  } catch (error) {
    if (isMissingExecutable(error)) {
      const status = baseStatus({
        ready: false,
        code: "CODEX_CLI_MISSING",
        detail: "Codex CLI was not found on PATH.",
        nextAction: "install",
      });
      stages.push(failedStage(
        "cli",
        "Codex CLI",
        "not found on PATH",
        status.detail,
        null,
        cliStarted,
      ));
      return { status, stages };
    }
    const status = baseStatus({
      ready: false,
      code: "CODEX_PROBE_FAILED",
      detail: errorText(error, "Could not inspect the Codex CLI installation."),
      nextAction: "diagnose",
    });
    stages.push(failedStage(
      "cli",
      "Codex CLI",
      "installation probe failed",
      status.detail,
      "codex doctor --summary",
      cliStarted,
    ));
    return { status, stages };
  }

  if (!version || compareVersions(version, MINIMUM_CODEX_VERSION) < 0) {
    const status = baseStatus({
      ready: false,
      code: "CODEX_CLI_OUTDATED",
      detail: `Codex ${version || "unknown"} is too old; Orynt requires >=${MINIMUM_CODEX_VERSION}.`,
      nextAction: "update",
      version,
      remediationCommand: "codex update",
    });
    stages.push(failedStage(
      "cli",
      "Codex CLI",
      `${version || "unknown"} · requires >=${MINIMUM_CODEX_VERSION}`,
      status.detail,
      "codex update",
      cliStarted,
      { version: version || null, minimumVersion: MINIMUM_CODEX_VERSION },
    ));
    return { status, stages };
  }
  stages.push({
    id: "cli",
    label: "Codex CLI",
    status: "pass",
    summary: version,
    evidence: { version, minimumVersion: MINIMUM_CODEX_VERSION },
    cause: null,
    remediation: null,
    durationMs: duration(cliStarted),
  });

  const appServerStarted = now();
  try {
    const result = await run("codex", ["app-server", "--help"], {
      timeout: 15_000,
      maxBuffer: 512_000,
    });
    if (
      !`${result.stdout ?? ""} ${result.stderr ?? ""}`.includes("--stdio")
    ) {
      const status = baseStatus({
        ready: false,
        code: "CODEX_APP_SERVER_UNAVAILABLE",
        detail: "Codex app-server stdio transport is unavailable.",
        nextAction: "update",
        version,
        remediationCommand: "codex update",
      });
      stages.push(failedStage(
        "app_server",
        "App server",
        "stdio transport unavailable",
        status.detail,
        "codex update",
        appServerStarted,
        { transport: "stdio", version },
      ));
      return { status, stages };
    }
  } catch (error) {
    const status = baseStatus({
      ready: false,
      code: "CODEX_APP_SERVER_UNAVAILABLE",
      detail: errorText(error, "Could not inspect Codex app-server support."),
      nextAction: "update",
      version,
      remediationCommand: "codex update",
    });
    stages.push(failedStage(
      "app_server",
      "App server",
      "support probe failed",
      status.detail,
      "codex update",
      appServerStarted,
      { transport: "stdio", version },
    ));
    return { status, stages };
  }
  stages.push({
    id: "app_server",
    label: "App server",
    status: "pass",
    summary: "stdio transport ready",
    evidence: { transport: "stdio", version },
    cause: null,
    remediation: null,
    durationMs: duration(appServerStarted),
  });

  const authenticationStarted = now();
  try {
    const result = await run("codex", ["login", "status"], {
      timeout: 15_000,
      maxBuffer: 512_000,
    });
    const detail = cleanDiagnostic(
      `${result.stdout ?? ""} ${result.stderr ?? ""}`,
      "authenticated session detected",
    );
    const status = baseStatus({
      ready: true,
      code: "CODEX_READY",
      detail: `${detail} · app-server ready`,
      nextAction: "none",
      version,
      authenticated: true,
      dynamicTools: true,
    });
    stages.push({
      id: "authentication",
      label: "Authentication",
      status: "pass",
      summary: detail,
      evidence: { authenticated: true },
      cause: null,
      remediation: null,
      durationMs: duration(authenticationStarted),
    });
    return { status, stages };
  } catch (error) {
    if (isCommandExit(error)) {
      const status = baseStatus({
        ready: false,
        code: "CODEX_AUTH_REQUIRED",
        detail: errorText(
          error,
          "No authenticated Codex CLI session was detected.",
        ),
        nextAction: "login",
        version,
        remediationCommand: "orynt setup",
      });
      stages.push(failedStage(
        "authentication",
        "Authentication",
        "sign-in required",
        status.detail,
        "orynt setup",
        authenticationStarted,
        { authenticated: false },
      ));
      return { status, stages };
    }
    const status = baseStatus({
      ready: false,
      code: "CODEX_PROBE_FAILED",
      detail: errorText(error, "Could not check Codex authentication."),
      nextAction: "diagnose",
      version,
      remediationCommand: "codex doctor --summary",
    });
    stages.push(failedStage(
      "authentication",
      "Authentication",
      "status probe failed",
      status.detail,
      "codex doctor --summary",
      authenticationStarted,
      { authenticated: false },
    ));
    return { status, stages };
  }
}

export function codexInstallGuidance(
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform === "win32") {
    return [
      "Install Codex in PowerShell:",
      '  powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
      "Alternative with npm:",
      "  npm install --global @openai/codex",
    ];
  }
  if (platform === "darwin") {
    return [
      "Install Codex:",
      "  curl -fsSL https://chatgpt.com/codex/install.sh | sh",
      "Alternatives:",
      "  brew install --cask codex",
      "  npm install --global @openai/codex",
    ];
  }
  return [
    "Install Codex:",
    "  curl -fsSL https://chatgpt.com/codex/install.sh | sh",
    "Alternative with npm:",
    "  npm install --global @openai/codex",
  ];
}

export function codexSecretLoginGuidance(
  method: "apiKey" | "accessToken",
  platform: NodeJS.Platform = process.platform,
): string[] {
  const variable =
    method === "apiKey" ? "OPENAI_API_KEY" : "CODEX_ACCESS_TOKEN";
  const flag =
    method === "apiKey" ? "--with-api-key" : "--with-access-token";
  const command =
    platform === "win32"
      ? `$env:${variable} | codex login ${flag}`
      : `printenv ${variable} | codex login ${flag}`;
  return [
    "Run this in another terminal so Orynt never receives the secret:",
    `  ${command}`,
    "Return here and choose Recheck after Codex finishes.",
  ];
}

function writeInstallGuidance(
  dependencies: CodexSetupDependencies,
): void {
  dependencies.write(
    [
      ...codexInstallGuidance(dependencies.platform),
      "Official guide: https://learn.chatgpt.com/docs/codex/cli#getting-started",
      "Orynt does not run remote installation scripts.",
    ].join("\n"),
  );
}

function choicesForStatus(
  status: CodexProviderStatus,
): ComposerChoice[] {
  if (
    status.code === "CODEX_CLI_OUTDATED" ||
    status.code === "CODEX_APP_SERVER_UNAVAILABLE"
  ) {
    return [
      {
        value: "update",
        label: "Update Codex",
        description: "Run codex update after confirmation.",
      },
      {
        value: "guidance",
        label: "Manual guidance",
        description: "Show official install and update commands.",
      },
      { value: "exit", label: "Exit Orynt" },
    ];
  }
  if (status.code === "CODEX_AUTH_REQUIRED") {
    return [
      {
        value: "browser",
        label: "Sign in with ChatGPT",
        description: "Open the normal browser OAuth flow.",
      },
      {
        value: "device",
        label: "Use device code",
        description: "For remote or headless systems; availability may vary.",
      },
      {
        value: "apiKey",
        label: "Use API key",
        description: "Usage-based access through OPENAI_API_KEY.",
      },
      {
        value: "accessToken",
        label: "Use enterprise token",
        description: "Trusted enterprise automation only.",
      },
      { value: "exit", label: "Exit Orynt" },
    ];
  }
  return [
    {
      value: "recheck",
      label: "Recheck",
      description: "Run the fast Codex readiness probe again.",
    },
    {
      value: "diagnose",
      label: "Show diagnostics",
      description: "Run codex doctor --summary manually.",
    },
    { value: "exit", label: "Exit Orynt" },
  ];
}

async function manualActionMenu(
  dependencies: CodexSetupDependencies,
): Promise<"recheck" | "back" | "exit"> {
  if (!dependencies.select) return "exit";
  const selected = await dependencies.select("Codex setup › ", [
    {
      value: "recheck",
      label: "Recheck",
      description: "Check Codex login status again.",
    },
    {
      value: "back",
      label: "Another method",
      description: "Return to authentication choices.",
    },
    { value: "exit", label: "Exit Orynt" },
  ]);
  return selected === "recheck" || selected === "back" ? selected : "exit";
}

export async function runCodexSetup(
  dependencies: CodexSetupDependencies,
): Promise<CodexSetupResult> {
  const probe = dependencies.probe ?? probeCodexCli;
  const runExternal = async (
    executable: string,
    argv: string[],
    options?: { timeoutMs?: number },
  ): Promise<CodexCommandResult> => {
    if (!dependencies.runExternal) return { exitCode: 1 };
    try {
      return options === undefined
        ? await dependencies.runExternal(executable, argv)
        : await dependencies.runExternal(executable, argv, options);
    } catch {
      dependencies.write(
        `Could not start \`${[executable, ...argv].join(" ")}\`. Run it manually, then recheck.`,
      );
      return { exitCode: 1 };
    }
  };
  let status = dependencies.initialStatus ?? (await probe());
  if (status.ready) return { outcome: "ready", status };
  if (!dependencies.isTTY || !dependencies.select) {
    return { outcome: "manual_action_required", status };
  }

  for (;;) {
    dependencies.write(`Codex setup required: ${status.detail}`);
    if (status.code === "CODEX_CLI_MISSING") {
      writeInstallGuidance(dependencies);
      return { outcome: "manual_action_required", status };
    }

    const selected = await dependencies.select(
      "Codex setup › ",
      choicesForStatus(status),
    );
    if (!selected || selected === "exit") {
      return { outcome: "cancelled", status };
    }

    if (selected === "guidance") {
      writeInstallGuidance(dependencies);
      return { outcome: "manual_action_required", status };
    }

    if (selected === "diagnose") {
      dependencies.write(
        "Run `codex doctor --summary` to inspect installation, authentication, network, proxy, CA, and workspace-policy failures.",
      );
      continue;
    }

    if (selected === "recheck") {
      status = await probe();
      if (status.ready) return { outcome: "ready", status };
      continue;
    }

    if (selected === "update") {
      if (!dependencies.runExternal) {
        writeInstallGuidance(dependencies);
        return { outcome: "manual_action_required", status };
      }
      const confirmed =
        (await dependencies.confirm?.(
          "Update the installed Codex CLI?",
        )) ?? false;
      if (!confirmed) {
        dependencies.write("Codex update cancelled. No change was made.");
        continue;
      }
      const result = await runExternal(
        "codex",
        ["update"],
        { timeoutMs: 120_000 },
      );
      if (result.exitCode !== 0) {
        dependencies.write(
          "Codex update did not complete. Use the manual installation guidance.",
        );
        writeInstallGuidance(dependencies);
        return { outcome: "failed", status };
      }
      status = await probe();
      if (status.ready) return { outcome: "ready", status };
      continue;
    }

    if (selected === "apiKey" || selected === "accessToken") {
      dependencies.write(
        codexSecretLoginGuidance(selected, dependencies.platform).join("\n"),
      );
      const next = await manualActionMenu(dependencies);
      if (next === "exit") {
        return { outcome: "manual_action_required", status };
      }
      if (next === "back") continue;
      status = await probe();
      if (status.ready) return { outcome: "ready", status };
      continue;
    }

    if (selected === "browser" || selected === "device") {
      if (!dependencies.runExternal) {
        return { outcome: "failed", status };
      }
      const argv =
        selected === "device" ? ["login", "--device-auth"] : ["login"];
      const result = await runExternal("codex", argv);
      if (result.exitCode !== 0) {
        dependencies.write(
          result.signal === "SIGINT"
            ? "Codex login cancelled."
            : "Codex login did not complete.",
        );
      }
      status = await probe();
      if (status.ready) return { outcome: "ready", status };
    }
  }
}

export function codexSetupStatusJson(status: ProviderStatus): string {
  const code =
    status.code ?? (status.ready ? "CODEX_READY" : "CODEX_PROBE_FAILED");
  const nextAction =
    status.nextAction ?? (status.ready ? "none" : "diagnose");
  return JSON.stringify({
    schemaVersion: 1,
    kind: "codex_setup_status",
    ready: status.ready,
    code,
    version: status.version || null,
    authenticated: status.authenticated === true,
    detail: cleanDiagnostic(status.detail, "Codex status unavailable."),
    nextAction,
    remediationCommand: status.remediationCommand ?? null,
  });
}

export function codexSetupHelp(): string {
  return [
    "Usage: orynt setup",
    "       orynt setup --check [--json]",
    "",
    "Interactive setup delegates credential handling and storage to Codex.",
    "Read-only checks never start login, installation, or update actions.",
  ].join("\n");
}
