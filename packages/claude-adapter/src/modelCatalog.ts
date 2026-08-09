import type { JsonRecord } from "./sse.js";
import type { ClaudeModelCapabilities } from "./tools.js";

/**
 * Structurally compatible with the CLI's `CliModelOption`. The adapter cannot
 * import from `packages/cli`, so the shape is restated here and assigned
 * structurally at the call site.
 */
export type ClaudeModelOption = {
  id: string;
  label: string;
  description?: string;
  supportedThinkingEfforts: ClaudeThinkingEffort[];
  defaultThinkingEffort?: ClaudeThinkingEffort;
  contextWindowTokens?: number;
  effectiveContextWindowTokens?: number;
  providerAutoCompactAtTokens?: number;
  /** Provider output cap. Used to clamp `max_tokens`; ignored by the picker. */
  maxOutputTokens?: number;
  capabilities: ClaudeModelCapabilities;
};

export type ClaudeThinkingEffort = "low" | "medium" | "high" | "xhigh";

const EFFORT_ORDER: ClaudeThinkingEffort[] = ["low", "medium", "high", "xhigh"];
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;
const MAX_SELECTABLE_MODELS = 40;
/**
 * Anthropic publishes no auto-compaction threshold, so Orynt applies the same
 * 90% rule the Codex catalog parser uses when the provider omits one.
 */
const EFFECTIVE_WINDOW_RATIO = 0.9;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : undefined;
}

/** Reads a `{ supported: boolean }` leaf from the nested capability tree. */
function supported(node: unknown, ...path: string[]): boolean {
  let current = record(node);
  for (const key of path) {
    current = record(current[key]);
  }
  return current.supported === true;
}

export function claudeCapabilitiesFromEntry(
  entry: JsonRecord,
): ClaudeModelCapabilities {
  const capabilities = record(entry.capabilities);
  const effort = EFFORT_ORDER.some((level) =>
    supported(capabilities, "effort", level),
  );
  return {
    effort,
    adaptiveThinking: supported(capabilities, "thinking", "types", "adaptive"),
    structuredOutputs: supported(capabilities, "structured_outputs"),
  };
}

function thinkingEfforts(entry: JsonRecord): ClaudeThinkingEffort[] {
  // A catalog entry that carries no capability object at all is reporting
  // nothing, not reporting "nothing is supported". Anthropic always sends the
  // object; Anthropic-compatible gateways commonly omit it. Returning an empty
  // list for those makes every effort look unavailable, and a tier
  // configuration — which always resolves as the `custom` preset — turns that
  // into a hard failure rather than a fallback, so no gateway model can be
  // bound at all. Default to the standard ladder and let the provider reject a
  // request it genuinely cannot serve.
  if (!isRecord(entry.capabilities)) return [...EFFORT_ORDER];
  const capabilities = record(entry.capabilities);
  // Anthropic has no `minimal`/`none`; `max` exists but Orynt never requests
  // it, so it is deliberately not surfaced in the picker.
  return EFFORT_ORDER.filter((level) =>
    supported(capabilities, "effort", level),
  );
}

/**
 * Pure parser over a `GET /v1/models` body. The network call lives in
 * {@link listClaudeModels} so this stays trivially testable against fixtures.
 */
export function parseClaudeModelCatalog(raw: string): ClaudeModelOption[] {
  let root: JsonRecord;
  try {
    root = record(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
  const entries = Array.isArray(root.data) ? root.data : [];
  const seen = new Set<string>();
  const options: ClaudeModelOption[] = [];
  for (const value of entries) {
    const entry = record(value);
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!MODEL_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    const label =
      typeof entry.display_name === "string" && entry.display_name.trim()
        ? entry.display_name.trim().slice(0, 160)
        : id;
    const contextWindowTokens = positiveInteger(entry.max_input_tokens);
    const effectiveContextWindowTokens = contextWindowTokens
      ? Math.trunc(contextWindowTokens * EFFECTIVE_WINDOW_RATIO)
      : undefined;
    const supportedThinkingEfforts = thinkingEfforts(entry);
    options.push({
      id,
      label,
      supportedThinkingEfforts,
      ...(supportedThinkingEfforts.includes("high")
        ? { defaultThinkingEffort: "high" as const }
        : {}),
      ...(contextWindowTokens ? { contextWindowTokens } : {}),
      ...(effectiveContextWindowTokens
        ? {
            effectiveContextWindowTokens,
            providerAutoCompactAtTokens: effectiveContextWindowTokens,
          }
        : {}),
      ...(positiveInteger(entry.max_tokens)
        ? { maxOutputTokens: positiveInteger(entry.max_tokens)! }
        : {}),
      capabilities: claudeCapabilitiesFromEntry(entry),
    });
  }
  options.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return options.slice(0, MAX_SELECTABLE_MODELS);
}

export type ListClaudeModelsOptions = {
  apiKey?: string;
  authToken?: string;
  baseUrl?: string;
  anthropicVersion?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxPages?: number;
};

/**
 * Fetches the live catalog, following `has_more`/`last_id` pagination. Returns
 * an empty list rather than throwing when the credential is missing, so a
 * catalog lookup never breaks a command that has other work to do.
 */
export async function listClaudeModels(
  options: ListClaudeModelsOptions = {},
): Promise<ClaudeModelOption[]> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const authToken = options.authToken ?? process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey && !authToken) return [];
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (
    options.baseUrl ??
    process.env.ANTHROPIC_BASE_URL ??
    "https://api.anthropic.com"
  ).replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "anthropic-version": options.anthropicVersion ?? "2023-06-01",
  };
  if (apiKey) headers["x-api-key"] = apiKey;
  else {
    headers.authorization = `Bearer ${authToken}`;
    headers["anthropic-beta"] = "oauth-2025-04-20";
  }
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(1, options.timeoutMs ?? 15_000),
  );
  const collected: ClaudeModelOption[] = [];
  const seen = new Set<string>();
  try {
    let after: string | undefined;
    for (let page = 0; page < (options.maxPages ?? 5); page += 1) {
      const url = new URL(`${baseUrl}/v1/models`);
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after_id", after);
      const response = await fetchImpl(url.toString(), {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      if (!response.ok) break;
      const raw = await response.text();
      for (const option of parseClaudeModelCatalog(raw)) {
        if (seen.has(option.id)) continue;
        seen.add(option.id);
        collected.push(option);
      }
      const body = record(JSON.parse(raw) as unknown);
      if (body.has_more !== true || typeof body.last_id !== "string") break;
      after = body.last_id;
    }
  } catch {
    return collected;
  } finally {
    clearTimeout(timeout);
  }
  collected.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  return collected.slice(0, MAX_SELECTABLE_MODELS);
}
