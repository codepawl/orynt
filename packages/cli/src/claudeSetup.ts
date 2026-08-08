import { redactSensitivePayload } from "@codepawl/shared";

import type {
  ClaudeProviderCode,
  CodexNextAction,
  ProviderStatus,
} from "./session.js";

const MAX_DIAGNOSTIC_LENGTH = 2_000;
const DEFAULT_API_KEY_ENV = "ANTHROPIC_API_KEY";
const DEFAULT_AUTH_TOKEN_ENV = "ANTHROPIC_AUTH_TOKEN";
const DEFAULT_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";
const PROBE_TIMEOUT_MS = 10_000;

export type { ClaudeProviderCode };

export type ClaudeProviderStatus = ProviderStatus & {
  provider: "anthropic";
  /** `http` for the Messages API route, `stdio` for the opt-in CLI route. */
  transport: "http" | "stdio";
  code: ClaudeProviderCode;
  nextAction: CodexNextAction;
  remediationCommand?: string;
};

export type ClaudeProbeStage = {
  id: "credential" | "api" | "cli" | "stream_protocol" | "authentication";
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

export type ClaudeEnvironmentProbe = {
  status: ClaudeProviderStatus;
  stages: ClaudeProbeStage[];
};

export type ClaudeSetupOutcome =
  | "ready"
  | "cancelled"
  | "manual_action_required"
  | "failed";

export type ClaudeSetupResult = {
  outcome: ClaudeSetupOutcome;
  status: ClaudeProviderStatus;
};

export type ClaudeSetupDependencies = {
  isTTY: boolean;
  platform?: NodeJS.Platform;
  write(value: string): void;
  confirm?: (prompt: string) => Promise<boolean>;
  probe?: () => Promise<ClaudeEnvironmentProbe>;
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected for tests; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  apiKeyEnv?: string;
  authTokenEnv?: string;
  baseUrl?: string;
  now?: () => number;
};

function cleanDiagnostic(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value : fallback;
  const redacted = redactSensitivePayload(text).payload;
  const safe = (typeof redacted === "string" ? redacted : fallback)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_DIAGNOSTIC_LENGTH);
  return safe || fallback;
}

function status(
  input: Pick<
    ClaudeProviderStatus,
    "code" | "detail" | "nextAction" | "ready"
  > &
    Partial<ClaudeProviderStatus>,
): ClaudeProviderStatus {
  return {
    provider: "anthropic",
    transport: "http",
    authenticated: false,
    dynamicTools: false,
    ...input,
  };
}

/**
 * Guidance for the interactive setup flow.
 *
 * Orynt never receives, prompts for, or stores the key. It records only the
 * name of the environment variable, matching the Codex delegation contract.
 */
export function claudeApiKeyGuidance(
  envName = DEFAULT_API_KEY_ENV,
  platform: NodeJS.Platform = process.platform,
): string[] {
  return [
    `Set ${envName} in your shell so Orynt never receives the secret:`,
    platform === "win32"
      ? `  $env:${envName} = "<your key>"`
      : `  export ${envName}="<your key>"`,
    "Create a key at https://platform.claude.com/settings/keys",
    `Orynt stores only the variable name "${envName}", never its value.`,
    "Then verify with: orynt setup --provider anthropic --check",
  ];
}

/**
 * Alternative for operators who prefer a short-lived OAuth token minted by the
 * Anthropic CLI over a long-lived API key. Orynt still never sees the value.
 */
export function claudeAntAuthGuidance(
  apiKeyEnv = DEFAULT_API_KEY_ENV,
  authTokenEnv = DEFAULT_AUTH_TOKEN_ENV,
): string[] {
  return [
    "Run these in another terminal so Orynt never receives the secret:",
    "  ant auth login",
    "  ant auth status",
    "Then export a short-lived token for this shell:",
    `  export ${authTokenEnv}="$(ant auth print-credentials --access-token)"`,
    "The token is short-lived and is not refreshed automatically; re-export it when it expires.",
    `Do not set ${apiKeyEnv} at the same time — the API rejects requests carrying both.`,
  ];
}

function credentialStage(
  env: NodeJS.ProcessEnv,
  apiKeyEnv: string,
  authTokenEnv: string,
  durationMs: number,
): ClaudeProbeStage {
  const hasApiKey = Boolean(env[apiKeyEnv]);
  const hasAuthToken = Boolean(env[authTokenEnv]);
  // Evidence records presence only. A prefix or length would leak key shape.
  const evidence = {
    apiKeyEnv,
    apiKeyPresent: hasApiKey,
    authTokenEnv,
    authTokenPresent: hasAuthToken,
  };
  if (hasApiKey && hasAuthToken) {
    return {
      id: "credential",
      label: "Anthropic credential",
      status: "fail",
      summary: `${apiKeyEnv} and ${authTokenEnv} are both set.`,
      evidence,
      cause: "The Anthropic API rejects requests carrying both credentials.",
      remediation: {
        description: `Unset one of ${apiKeyEnv} or ${authTokenEnv}.`,
        command: null,
      },
      durationMs,
    };
  }
  if (!hasApiKey && !hasAuthToken) {
    return {
      id: "credential",
      label: "Anthropic credential",
      status: "fail",
      summary: `${apiKeyEnv} is not set.`,
      evidence,
      cause: "Orynt reads the credential from the environment and never stores it.",
      remediation: {
        description: `Export ${apiKeyEnv} in your shell.`,
        command: null,
      },
      durationMs,
    };
  }
  return {
    id: "credential",
    label: "Anthropic credential",
    status: "pass",
    summary: `${hasApiKey ? apiKeyEnv : authTokenEnv} is available.`,
    evidence,
    cause: null,
    remediation: null,
    durationMs,
  };
}

async function apiStage(
  dependencies: ClaudeSetupDependencies,
  env: NodeJS.ProcessEnv,
  apiKeyEnv: string,
  authTokenEnv: string,
): Promise<ClaudeProbeStage> {
  const started = dependencies.now?.() ?? Date.now();
  const elapsed = () => Math.max(0, (dependencies.now?.() ?? Date.now()) - started);
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const baseUrl = (
    dependencies.baseUrl ??
    env.ANTHROPIC_BASE_URL ??
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  const apiKey = env[apiKeyEnv];
  const headers: Record<string, string> = {
    "anthropic-version": ANTHROPIC_VERSION,
  };
  if (apiKey) headers["x-api-key"] = apiKey;
  else {
    headers.authorization = `Bearer ${env[authTokenEnv]}`;
    headers["anthropic-beta"] = "oauth-2025-04-20";
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${baseUrl}/v1/models?limit=1`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const evidence = {
      endpoint: "/v1/models",
      httpStatus: response.status,
    };
    if (response.ok) {
      return {
        id: "api",
        label: "Anthropic API reachability",
        status: "pass",
        summary: "The Anthropic API accepted the credential.",
        evidence,
        cause: null,
        remediation: null,
        durationMs: elapsed(),
      };
    }
    const detail = cleanDiagnostic(
      await response.text().catch(() => ""),
      `Anthropic returned ${response.status}.`,
    );
    return {
      id: "api",
      label: "Anthropic API reachability",
      status: "fail",
      summary: `Anthropic returned ${response.status}.`,
      evidence,
      cause: detail,
      remediation: {
        description:
          response.status === 401
            ? "Replace the credential with a valid key."
            : response.status === 403
              ? "Grant this key access to the configured model."
              : "Retry once the provider recovers.",
        command: null,
      },
      durationMs: elapsed(),
    };
  } catch (error) {
    return {
      id: "api",
      label: "Anthropic API reachability",
      status: "fail",
      summary: "The Anthropic API could not be reached.",
      evidence: { endpoint: "/v1/models", httpStatus: null },
      cause: cleanDiagnostic(
        error instanceof Error ? error.message : String(error ?? ""),
        "The request failed before a response arrived.",
      ),
      remediation: {
        description: "Check network access to api.anthropic.com.",
        command: null,
      },
      durationMs: elapsed(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function statusForStages(
  stages: ClaudeProbeStage[],
  apiKeyEnv: string,
): ClaudeProviderStatus {
  const credential = stages.find((stage) => stage.id === "credential")!;
  if (credential.status === "fail") {
    const conflict = credential.evidence.apiKeyPresent === true &&
      credential.evidence.authTokenPresent === true;
    return status({
      ready: false,
      code: conflict ? "CLAUDE_CREDENTIAL_CONFLICT" : "CLAUDE_AUTH_REQUIRED",
      detail: credential.summary,
      nextAction: "configure",
      remediationCommand: "orynt setup --provider anthropic",
    });
  }
  const api = stages.find((stage) => stage.id === "api");
  if (!api || api.status === "pass") {
    return status({
      ready: true,
      authenticated: true,
      code: "CLAUDE_READY",
      detail: `Anthropic is reachable with ${apiKeyEnv}.`,
      nextAction: "none",
    });
  }
  const httpStatus = api.evidence.httpStatus;
  const code: ClaudeProviderCode =
    httpStatus === 401
      ? "CLAUDE_AUTH_INVALID"
      : httpStatus === 403
        ? "CLAUDE_MODEL_ACCESS_DENIED"
        : httpStatus === 429
          ? "CLAUDE_RATE_LIMITED"
          : "CLAUDE_PROBE_FAILED";
  // A rate limit proves the credential works; it must not read as broken auth.
  const rateLimited = code === "CLAUDE_RATE_LIMITED";
  return status({
    ready: rateLimited,
    authenticated: rateLimited,
    code,
    detail: api.cause ?? api.summary,
    nextAction: rateLimited ? "none" : "diagnose",
    remediationCommand: "orynt setup --provider anthropic --check",
  });
}

export type ClaudeExecFile = (
  executable: string,
  argv: string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<{ stdout?: string | Buffer; stderr?: string | Buffer }>;

type CommandError = Error & {
  code?: string | number;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
};

function commandText(error: unknown): string {
  const failure = error as CommandError;
  return cleanDiagnostic(
    `${failure?.stdout ?? ""} ${failure?.stderr ?? ""} ${
      error instanceof Error ? error.message : String(error ?? "")
    }`,
    "The command produced no diagnostic output.",
  );
}

/**
 * Probes the locally installed `claude` CLI used by the opt-in Track B route.
 *
 * Protocol support is feature-detected from `claude -p --help` rather than
 * pinned to a minimum version: the flag has no single documented introduction
 * release, and a guessed version gate would reject working installations.
 */
export async function probeClaudeCli(
  dependencies: {
    execFile?: ClaudeExecFile;
    executablePath?: string;
  } = {},
): Promise<ClaudeEnvironmentProbe> {
  const execFile = dependencies.execFile;
  const executable = dependencies.executablePath ?? "claude";
  const stages: ClaudeProbeStage[] = [];
  if (!execFile) {
    return {
      status: status({
        transport: "stdio",
        ready: false,
        code: "CLAUDE_PROBE_FAILED",
        detail: "Claude CLI probing is unavailable in this host.",
        nextAction: "diagnose",
      }),
      stages,
    };
  }
  const run = (argv: string[]) =>
    execFile(executable, argv, { timeout: 15_000, maxBuffer: 4_000_000 });

  let version = "";
  try {
    const { stdout } = await run(["--version"]);
    version = cleanDiagnostic(String(stdout ?? ""), "");
    stages.push({
      id: "cli",
      label: "Claude CLI",
      status: "pass",
      summary: version || "claude responded to --version.",
      evidence: { executable, version: version || null },
      cause: null,
      remediation: null,
      durationMs: 0,
    });
  } catch (error) {
    const missing = (error as CommandError)?.code === "ENOENT";
    stages.push({
      id: "cli",
      label: "Claude CLI",
      status: "fail",
      summary: missing
        ? `${executable} was not found on PATH.`
        : `${executable} --version failed.`,
      evidence: { executable, version: null },
      cause: commandText(error),
      remediation: {
        description: "Install the Claude Code CLI and ensure it is on PATH.",
        command: null,
      },
      durationMs: 0,
    });
    return {
      status: status({
        transport: "stdio",
        ready: false,
        code: "CLAUDE_CLI_MISSING",
        detail: stages[0]!.summary,
        nextAction: "install",
      }),
      stages,
    };
  }

  try {
    const { stdout, stderr } = await run(["-p", "--help"]);
    const help = `${String(stdout ?? "")}${String(stderr ?? "")}`;
    const supported =
      help.includes("--input-format") && help.includes("stream-json");
    stages.push({
      id: "stream_protocol",
      label: "Bidirectional stream protocol",
      status: supported ? "pass" : "fail",
      summary: supported
        ? "claude -p supports --input-format stream-json."
        : "claude -p does not advertise --input-format stream-json.",
      evidence: { executable, streamJsonInput: supported },
      cause: supported ? null : "Orynt drives the CLI over stream-json stdio.",
      remediation: supported
        ? null
        : { description: "Update the Claude Code CLI.", command: null },
      durationMs: 0,
    });
    if (!supported) {
      return {
        status: status({
        transport: "stdio",
          ready: false,
          code: "CLAUDE_STREAM_PROTOCOL_UNAVAILABLE",
          detail: stages[1]!.summary,
          nextAction: "update",
        }),
        stages,
      };
    }
  } catch (error) {
    stages.push({
      id: "stream_protocol",
      label: "Bidirectional stream protocol",
      status: "fail",
      summary: "claude -p --help failed.",
      evidence: { executable, streamJsonInput: false },
      cause: commandText(error),
      remediation: {
        description: "Update the Claude Code CLI.",
        command: null,
      },
      durationMs: 0,
    });
    return {
      status: status({
        transport: "stdio",
        ready: false,
        code: "CLAUDE_STREAM_PROTOCOL_UNAVAILABLE",
        detail: "claude -p --help failed.",
        nextAction: "update",
      }),
      stages,
    };
  }

  try {
    await run(["auth", "status"]);
    stages.push({
      id: "authentication",
      label: "Claude CLI authentication",
      status: "pass",
      summary: "claude auth status reports a signed-in account.",
      evidence: { executable, authenticated: true },
      cause: null,
      remediation: null,
      durationMs: 0,
    });
  } catch (error) {
    stages.push({
      id: "authentication",
      label: "Claude CLI authentication",
      status: "fail",
      summary: "claude auth status reports no signed-in account.",
      evidence: { executable, authenticated: false },
      cause: commandText(error),
      remediation: {
        // Orynt never runs the login itself: the credential must never pass
        // through this process.
        description: "Run `claude auth login` in another terminal.",
        command: null,
      },
      durationMs: 0,
    });
    return {
      status: status({
        transport: "stdio",
        ready: false,
        code: "CLAUDE_AUTH_REQUIRED",
        detail: "Run `claude auth login` in another terminal, then recheck.",
        nextAction: "login",
        remediationCommand: "claude auth login",
      }),
      stages,
    };
  }

  return {
    status: status({
        transport: "stdio",
      ready: true,
      authenticated: true,
      code: "CLAUDE_READY",
      detail: `The Claude CLI is signed in${version ? ` (${version})` : ""}.`,
      nextAction: "none",
      ...(version ? { version } : {}),
    }),
    stages,
  };
}

export async function probeClaudeEnvironment(
  dependencies: Partial<ClaudeSetupDependencies> = {},
): Promise<ClaudeEnvironmentProbe> {
  const env = dependencies.env ?? process.env;
  const apiKeyEnv = dependencies.apiKeyEnv ?? DEFAULT_API_KEY_ENV;
  const authTokenEnv = dependencies.authTokenEnv ?? DEFAULT_AUTH_TOKEN_ENV;
  const stages: ClaudeProbeStage[] = [
    credentialStage(env, apiKeyEnv, authTokenEnv, 0),
  ];
  if (stages[0]!.status === "pass") {
    stages.push(
      await apiStage(
        dependencies as ClaudeSetupDependencies,
        env,
        apiKeyEnv,
        authTokenEnv,
      ),
    );
  }
  return { status: statusForStages(stages, apiKeyEnv), stages };
}

export async function probeClaudeProvider(
  dependencies: Partial<ClaudeSetupDependencies> = {},
): Promise<ClaudeProviderStatus> {
  return (await probeClaudeEnvironment(dependencies)).status;
}

/**
 * Interactive setup. There is deliberately no code path that accepts a secret:
 * the flow prints guidance and rechecks the environment.
 */
export async function runClaudeSetup(
  dependencies: ClaudeSetupDependencies,
): Promise<ClaudeSetupResult> {
  const probe = dependencies.probe ?? (() => probeClaudeEnvironment(dependencies));
  const apiKeyEnv = dependencies.apiKeyEnv ?? DEFAULT_API_KEY_ENV;
  const authTokenEnv = dependencies.authTokenEnv ?? DEFAULT_AUTH_TOKEN_ENV;
  let current = (await probe()).status;
  if (current.ready) {
    dependencies.write(`Anthropic is ready. ${current.detail}\n`);
    return { outcome: "ready", status: current };
  }
  const guidance = [
    ...claudeApiKeyGuidance(apiKeyEnv, dependencies.platform ?? process.platform),
    "",
    ...claudeAntAuthGuidance(apiKeyEnv, authTokenEnv),
  ];
  dependencies.write(`${current.detail}\n${guidance.join("\n")}\n`);
  if (!dependencies.isTTY || !dependencies.confirm) {
    return { outcome: "manual_action_required", status: current };
  }
  while (!current.ready) {
    const again = await dependencies.confirm(
      "Recheck the Anthropic credential now?",
    );
    if (!again) return { outcome: "cancelled", status: current };
    current = (await probe()).status;
    if (current.ready) {
      dependencies.write(`Anthropic is ready. ${current.detail}\n`);
      return { outcome: "ready", status: current };
    }
    dependencies.write(`${current.detail}\n`);
  }
  return { outcome: "ready", status: current };
}

export function claudeSetupStatusJson(status: ProviderStatus): string {
  const code =
    status.code ?? (status.ready ? "CLAUDE_READY" : "CLAUDE_PROBE_FAILED");
  const nextAction = status.nextAction ?? (status.ready ? "none" : "diagnose");
  return JSON.stringify({
    schemaVersion: 1,
    kind: "claude_setup_status",
    ready: status.ready,
    code,
    version: status.version || null,
    authenticated: status.authenticated === true,
    detail: cleanDiagnostic(status.detail, "Anthropic status unavailable."),
    nextAction,
    remediationCommand: status.remediationCommand ?? null,
  });
}

export function claudeSetupHelp(): string {
  return [
    "Usage: orynt setup --provider anthropic",
    "       orynt setup --provider anthropic --check [--json]",
    "",
    "Orynt reads the Anthropic credential from the environment and never",
    "stores, prints, or transports its value. Read-only checks never write.",
  ].join("\n");
}
