import type {
  ProviderUsageDetail,
  ProviderUsageMeterV1,
  ProviderUsageReader,
  ProviderUsageSnapshotV1,
  ProviderUsageWindowV1,
} from "@codepawl/model-runtime";

const FAMILY_LABELS: Record<string, string> = {
  requests: "Requests",
  tokens: "Tokens",
  "input-tokens": "Input tokens",
  "output-tokens": "Output tokens",
};

export type ClaudeRateLimitWindow = {
  id: string;
  label: string;
  limit: number;
  remaining: number;
  resetsAt?: string;
};

export type ClaudeRateLimitObservation = {
  observedAt: string;
  windows: ClaudeRateLimitWindow[];
  retryAfterMs?: number;
};

function integer(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Extracts the `anthropic-ratelimit-<family>-{limit,remaining,reset}` triples a
 * response carries. Families are discovered from the headers rather than
 * hard-coded, so a new one appears without a code change.
 */
export function parseClaudeRateLimitHeaders(
  headers: Headers,
  observedAt: string,
): ClaudeRateLimitObservation | undefined {
  const families = new Set<string>();
  headers.forEach((_value, name) => {
    const match = /^anthropic-ratelimit-(.+)-limit$/u.exec(name.toLowerCase());
    if (match) families.add(match[1]!);
  });
  const windows: ClaudeRateLimitWindow[] = [];
  for (const family of [...families].sort()) {
    const limit = integer(headers.get(`anthropic-ratelimit-${family}-limit`));
    const remaining = integer(
      headers.get(`anthropic-ratelimit-${family}-remaining`),
    );
    if (limit === undefined || remaining === undefined || limit === 0) continue;
    const reset = headers.get(`anthropic-ratelimit-${family}-reset`);
    windows.push({
      id: family,
      label: FAMILY_LABELS[family] ?? family,
      limit,
      remaining,
      ...(reset ? { resetsAt: reset } : {}),
    });
  }
  const retryAfter = headers.get("retry-after");
  const retryAfterSeconds = retryAfter
    ? Number.parseFloat(retryAfter)
    : Number.NaN;
  if (windows.length === 0 && !Number.isFinite(retryAfterSeconds)) {
    return undefined;
  }
  return {
    observedAt,
    windows,
    ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
      ? { retryAfterMs: Math.round(retryAfterSeconds * 1_000) }
      : {}),
  };
}

/**
 * Holds the most recent rate-limit observation. The Anthropic API exposes no
 * account or quota endpoint for API keys, so this is the only usage signal
 * available and it exists only after a turn has actually run.
 */
export class ClaudeRateLimitRecorder {
  private latest?: ClaudeRateLimitObservation;

  record(headers: Headers, observedAt = new Date().toISOString()): void {
    const observation = parseClaudeRateLimitHeaders(headers, observedAt);
    if (observation) this.latest = observation;
  }

  read(): ClaudeRateLimitObservation | undefined {
    return this.latest;
  }
}

function meters(
  observation: ClaudeRateLimitObservation,
): ProviderUsageMeterV1[] {
  return observation.windows.map((window, index): ProviderUsageMeterV1 => {
    const remainingPercent = Math.max(
      0,
      Math.min(100, (window.remaining / window.limit) * 100),
    );
    const usage: ProviderUsageWindowV1 = {
      id: window.id,
      label: window.label,
      usedPercent: Math.round((100 - remainingPercent) * 100) / 100,
      remainingPercent: Math.round(remainingPercent * 100) / 100,
      ...(window.resetsAt ? { resetsAt: window.resetsAt } : {}),
    };
    return {
      id: window.id,
      label: window.label,
      primary: index === 0,
      windows: [usage],
    };
  });
}

export type ClaudeProviderUsageReaderOptions = {
  recorder: ClaudeRateLimitRecorder;
  now?: () => Date;
};

export class ClaudeProviderUsageReader implements ProviderUsageReader {
  readonly providerId = "anthropic-api";
  readonly providerLabel = "Anthropic API";

  constructor(private readonly options: ClaudeProviderUsageReaderOptions) {}

  async readUsage(
    _options: { detail?: ProviderUsageDetail; timeoutMs?: number } = {},
  ): Promise<ProviderUsageSnapshotV1> {
    const generatedAt = (this.options.now?.() ?? new Date()).toISOString();
    const observation = this.options.recorder.read();
    const base = {
      schemaVersion: 1,
      kind: "orynt_provider_usage",
      generatedAt,
      provider: {
        id: this.providerId,
        label: this.providerLabel,
        transport: "anthropic-messages",
      },
      // API keys carry no plan or credit balance. Reporting `null` is honest;
      // inventing an account shape would not be.
      account: null,
    } as const;
    if (!observation) {
      return {
        ...base,
        status: "unavailable",
        meters: [],
        issues: [
          {
            code: "CLAUDE_USAGE_LIMITED",
            severity: "warning",
            message:
              "Anthropic API keys expose only per-request rate-limit headers. Run a turn first; quota and spend are visible in the Anthropic Console.",
          },
        ],
      };
    }
    return {
      ...base,
      status: "degraded",
      meters: meters(observation),
      issues: [
        {
          code: "CLAUDE_USAGE_LIMITED",
          severity: "warning",
          message: `Rate-limit headers observed at ${observation.observedAt}. Anthropic API keys expose no quota or spend endpoint; see the Anthropic Console.`,
        },
      ],
    };
  }
}
