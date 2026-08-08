import {
  ClaudeCliRuntime,
  ClaudeMessagesRuntime,
  ClaudeProviderUsageReader,
  ClaudeRateLimitRecorder,
} from "@codepawl/claude-adapter";
import {
  CodexAppServerRuntime,
  CodexProviderUsageReader,
} from "@codepawl/codex-adapter";
import type {
  AgentRuntime,
  ProviderUsageDetail,
  ProviderUsageSnapshotV1,
} from "@codepawl/model-runtime";
import { ResponsesAgentRuntime } from "@codepawl/model-runtime";
import type { OrchestrationProviderId } from "@codepawl/shared";

let sharedRuntime: CodexAppServerRuntime | undefined;
let sharedUsageReader: CodexProviderUsageReader | undefined;
let sharedResponsesRuntime: ResponsesAgentRuntime | undefined;
let sharedClaudeRuntime: ClaudeMessagesRuntime | undefined;
let sharedClaudeCliRuntime: ClaudeCliRuntime | undefined;
let sharedClaudeUsageReader: ClaudeProviderUsageReader | undefined;
let sharedOpencodeRuntime: ClaudeMessagesRuntime | undefined;

/**
 * Opt-in diagnostic route that drives a locally installed, user-authenticated
 * `claude` CLI instead of the Anthropic API. Default off: it is slower, it
 * loads repository-supplied CLI configuration, and it reports no usage.
 */
export function useClaudeCliRuntime(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.ORYNT_CLAUDE_RUNTIME === "cli";
}

/**
 * Shared between the runtime and the usage reader: rate-limit headers observed
 * during a turn are the only usage signal an Anthropic API key exposes.
 */
const claudeRateLimits = new ClaudeRateLimitRecorder();

export function cliCodexAppServerRuntime(): CodexAppServerRuntime {
  sharedRuntime ??= new CodexAppServerRuntime();
  return sharedRuntime;
}

/**
 * Native, in-process runtimes that speak the shared `AgentRuntime` contract.
 * The Codex app-server path is deliberately not part of this registry: it
 * exposes its own thread-oriented surface (`runTurn`, `compactThread`) rather
 * than `startSession`.
 */
export type CliNativeProvider =
  | "openai-api"
  | "anthropic-api"
  | "opencode-api";

/**
 * OpenCode Go's Anthropic-compatible endpoint. The runtime appends
 * `/v1/messages`, matching the service's documented path.
 *
 * Only Go is bound. OpenCode Zen is a separate base URL serving a different
 * curated model list, so it needs its own verified tier bindings rather than a
 * shared constant that would silently point Go's models at Zen.
 */
export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go";

/**
 * Effort ladder offered for every OpenCode model.
 *
 * OpenCode's catalog is OpenAI-shaped and carries no capability metadata, so
 * this is stated as a property of the provider rather than inferred from an
 * absent field. Declaring it here keeps the catalog honest about *why* the
 * ladder is what it is, instead of depending on a parser fallback that exists
 * for unknown gateways in general.
 */
export const OPENCODE_THINKING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export function cliNativeRuntime(provider: CliNativeProvider): AgentRuntime {
  if (provider === "opencode-api") {
    // OpenCode speaks the Anthropic Messages protocol, so the existing runtime
    // is bound to a different endpoint and credential rather than duplicated.
    //
    // `authTokenEnv` is deliberately scoped to OpenCode. Left at its Anthropic
    // default, a user holding both an OpenCode key and an Anthropic OAuth token
    // would trip the "set only one credential" guard, even though the two
    // belong to different providers.
    //
    // The base URL is passed explicitly so `ANTHROPIC_BASE_URL`, which a user
    // may have set to reach an Anthropic gateway, cannot redirect OpenCode
    // traffic.
    sharedOpencodeRuntime ??= new ClaudeMessagesRuntime({
      baseUrl: OPENCODE_GO_BASE_URL,
      apiKeyEnv: "OPENCODE_API_KEY",
      authTokenEnv: "OPENCODE_AUTH_TOKEN",
    });
    return sharedOpencodeRuntime;
  }
  if (provider === "anthropic-api") {
    if (useClaudeCliRuntime()) {
      sharedClaudeCliRuntime ??= new ClaudeCliRuntime();
      return sharedClaudeCliRuntime;
    }
    sharedClaudeRuntime ??= new ClaudeMessagesRuntime({
      onResponseHeaders: (headers) => claudeRateLimits.record(headers),
    });
    return sharedClaudeRuntime;
  }
  sharedResponsesRuntime ??= new ResponsesAgentRuntime();
  return sharedResponsesRuntime;
}

export async function readCliProviderUsage(
  detail: ProviderUsageDetail = "quota",
  providerId: OrchestrationProviderId = "codex-cli",
): Promise<ProviderUsageSnapshotV1> {
  if (providerId === "anthropic-api") {
    sharedClaudeUsageReader ??= new ClaudeProviderUsageReader({
      recorder: claudeRateLimits,
    });
    return sharedClaudeUsageReader.readUsage({ detail });
  }
  if (providerId === "opencode-api") {
    return {
      schemaVersion: 1,
      kind: "orynt_provider_usage",
      generatedAt: new Date().toISOString(),
      status: "unavailable",
      provider: {
        id: providerId,
        label: "OpenCode",
        transport: "anthropic-messages",
      },
      account: null,
      meters: [],
      issues: [
        {
          code: "OPENCODE_USAGE_LIMITED",
          severity: "warning",
          message:
            "OpenCode exposes no usage endpoint. Plan limits are visible in the OpenCode dashboard.",
        },
      ],
    };
  }
  if (providerId !== "codex-cli") {
    // The OpenAI API key path has no usage endpoint either, and no reader yet.
    return {
      schemaVersion: 1,
      kind: "orynt_provider_usage",
      generatedAt: new Date().toISOString(),
      status: "unavailable",
      provider: {
        id: providerId,
        label: "OpenAI API",
        transport: "openai-responses",
      },
      account: null,
      meters: [],
      issues: [
        {
          code: "OPENAI_USAGE_LIMITED",
          severity: "warning",
          message:
            "OpenAI API keys expose no usage endpoint. Quota and spend are visible in the OpenAI dashboard.",
        },
      ],
    };
  }
  sharedUsageReader ??= new CodexProviderUsageReader({
    runtime: cliCodexAppServerRuntime(),
  });
  return sharedUsageReader.readUsage({ detail });
}

export async function shutdownCliProviderRuntime(): Promise<void> {
  const runtime = sharedRuntime;
  const responses = sharedResponsesRuntime;
  const claude = sharedClaudeRuntime;
  const claudeCli = sharedClaudeCliRuntime;
  const opencode = sharedOpencodeRuntime;
  sharedClaudeCliRuntime = undefined;
  sharedRuntime = undefined;
  sharedUsageReader = undefined;
  sharedResponsesRuntime = undefined;
  sharedClaudeRuntime = undefined;
  sharedClaudeUsageReader = undefined;
  sharedOpencodeRuntime = undefined;
  await Promise.all([
    runtime?.shutdown(),
    responses?.close(),
    claude?.close(),
    claudeCli?.close(),
    opencode?.close(),
  ]);
}
