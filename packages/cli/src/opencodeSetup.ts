import type {
  CodexNextAction,
  OpencodeProviderCode,
  ProviderStatus,
} from "./session.js";
import { OPENCODE_GO_BASE_URL } from "./provider.js";

const API_KEY_ENV = "OPENCODE_API_KEY";
const PROBE_TIMEOUT_MS = 8_000;

export type OpencodeProviderStatus = ProviderStatus & {
  provider: "opencode";
  transport: "http";
  code: OpencodeProviderCode;
  nextAction: CodexNextAction;
};

export type OpencodeSetupResult = {
  outcome: "ready" | "cancelled" | "manual_action_required";
  status: OpencodeProviderStatus;
};

export type OpencodeSetupDependencies = {
  isTTY: boolean;
  write(value: string): void;
  confirm?: (prompt: string) => Promise<boolean>;
  probe?: () => Promise<OpencodeProviderStatus>;
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  baseUrl?: string;
};

function status(
  ready: boolean,
  code: OpencodeProviderCode,
  detail: string,
  nextAction: CodexNextAction,
): OpencodeProviderStatus {
  return { ready, provider: "opencode", transport: "http", code, detail, nextAction };
}

/**
 * Reads the credential from the environment and confirms the plan can reach the
 * catalog. Read-only: this never writes configuration and never receives,
 * stores, prints, or forwards the key's value.
 */
export async function probeOpencodeEnvironment(
  dependencies: Pick<
    OpencodeSetupDependencies,
    "fetchImpl" | "env" | "baseUrl"
  > = {},
): Promise<OpencodeProviderStatus> {
  const env = dependencies.env ?? process.env;
  const apiKey = env[API_KEY_ENV];
  if (!apiKey) {
    return status(
      false,
      "OPENCODE_AUTH_REQUIRED",
      `${API_KEY_ENV} is not set.`,
      "configure",
    );
  }
  const baseUrl = (dependencies.baseUrl ?? OPENCODE_GO_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // The Anthropic-compatible route authenticates with `x-api-key`; the
    // OpenAI-compatible one uses a bearer token. Orynt drives the former, so
    // the probe must exercise the same header the runtime will send.
    const response = await fetchImpl(`${baseUrl}/v1/models`, {
      method: "GET",
      headers: { "x-api-key": apiKey },
      signal: controller.signal,
    });
    if (response.ok) {
      return status(
        true,
        "OPENCODE_READY",
        "OpenCode accepted the credential.",
        "none",
      );
    }
    return status(
      false,
      response.status === 401 || response.status === 403
        ? "OPENCODE_AUTH_INVALID"
        : "OPENCODE_PROBE_FAILED",
      `OpenCode returned ${response.status}.`,
      response.status === 401 || response.status === 403
        ? "configure"
        : "diagnose",
    );
  } catch (error) {
    return status(
      false,
      "OPENCODE_PROBE_FAILED",
      `OpenCode could not be reached: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "diagnose",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function opencodeSetupHelp(): string {
  return [
    "Usage: orynt setup --provider opencode",
    "       orynt setup --provider opencode --check [--json]",
    "",
    "Orynt reads the OpenCode key from the environment and never stores,",
    "prints, or transports its value. Read-only checks never write.",
  ].join("\n");
}

export function opencodeSetupStatusJson(status: OpencodeProviderStatus): string {
  return JSON.stringify({
    schemaVersion: 1,
    kind: "orynt_provider_status",
    provider: status.provider,
    transport: status.transport,
    ready: status.ready,
    code: status.code,
    detail: status.detail,
    nextAction: status.nextAction,
  });
}

export function opencodeApiKeyGuidance(): string[] {
  return [
    `Set ${API_KEY_ENV} in your shell so Orynt never receives the secret:`,
    `  export ${API_KEY_ENV}="<your key>"`,
    "Sign in and copy the key at https://opencode.ai/auth",
    `Orynt stores only the variable name "${API_KEY_ENV}", never its value.`,
    "Then verify with: orynt setup --provider opencode --check",
  ];
}

/**
 * Interactive setup. As with the other providers there is deliberately no code
 * path that accepts a secret: the flow prints guidance and rechecks the
 * environment.
 */
export async function runOpencodeSetup(
  dependencies: OpencodeSetupDependencies,
): Promise<OpencodeSetupResult> {
  const probe = dependencies.probe ??
    (() => probeOpencodeEnvironment(dependencies));
  let current = await probe();
  if (current.ready) {
    dependencies.write(`OpenCode is ready. ${current.detail}\n`);
    return { outcome: "ready", status: current };
  }
  dependencies.write(
    `${current.detail}\n${opencodeApiKeyGuidance().join("\n")}\n`,
  );
  if (!dependencies.isTTY || !dependencies.confirm) {
    return { outcome: "manual_action_required", status: current };
  }
  while (!current.ready) {
    const again = await dependencies.confirm(
      "Recheck the OpenCode credential now?",
    );
    if (!again) return { outcome: "cancelled", status: current };
    current = await probe();
    if (current.ready) {
      dependencies.write(`OpenCode is ready. ${current.detail}\n`);
    }
  }
  return { outcome: "ready", status: current };
}
