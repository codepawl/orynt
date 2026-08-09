import type {
  ProviderUsageAnalyticsV1,
  ProviderUsageIssueV1,
  ProviderUsageMeterV1,
  ProviderUsageReader,
  ProviderUsageSnapshotV1,
  ProviderUsageWindowV1,
} from "@codepawl/model-runtime";
import { redactSensitivePayload } from "@codepawl/shared";

import { CodexAppServerRuntime } from "./appServer.js";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0
    ? value
    : undefined;
}

function percent(value: unknown): number | undefined {
  const number = finiteInteger(value);
  return number === undefined ? undefined : Math.min(100, number);
}

function isoTimestamp(value: unknown): string | undefined {
  const seconds = finiteInteger(value);
  if (seconds === undefined) return undefined;
  const date = new Date(seconds * 1_000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function durationLabel(minutes: number | undefined, fallback: string): string {
  if (minutes === undefined) return fallback;
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const redacted = redactSensitivePayload(raw).payload;
  const value = typeof redacted === "string" ? redacted : "Provider request failed";
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 300);
}

function issue(
  code: string,
  message: string,
  severity: ProviderUsageIssueV1["severity"],
): ProviderUsageIssueV1 {
  return { code, message, severity };
}

function window(
  id: "primary" | "secondary",
  value: unknown,
): ProviderUsageWindowV1 | undefined {
  const candidate = record(value);
  const usedPercent = percent(candidate.usedPercent);
  if (usedPercent === undefined) return undefined;
  const windowDurationMinutes = finiteInteger(candidate.windowDurationMins);
  return {
    id,
    label: durationLabel(windowDurationMinutes, id),
    usedPercent,
    remainingPercent: Math.max(0, 100 - usedPercent),
    ...(windowDurationMinutes === undefined ? {} : { windowDurationMinutes }),
    ...(isoTimestamp(candidate.resetsAt)
      ? { resetsAt: isoTimestamp(candidate.resetsAt) }
      : {}),
  };
}

function meter(
  id: string,
  value: unknown,
  primaryId: string,
): ProviderUsageMeterV1 | undefined {
  const candidate = record(value);
  const windows = [
    window("primary", candidate.primary),
    window("secondary", candidate.secondary),
  ].filter((entry): entry is ProviderUsageWindowV1 => entry !== undefined);
  const credits = record(candidate.credits);
  const spend = record(candidate.individualLimit);
  const spendResetsAt = isoTimestamp(spend.resetsAt);
  const spendRemaining = percent(spend.remainingPercent);
  const spendControl =
    text(spend.limit) &&
    text(spend.used) &&
    spendResetsAt &&
    spendRemaining !== undefined
      ? {
          limit: text(spend.limit)!,
          used: text(spend.used)!,
          remainingPercent: spendRemaining,
          resetsAt: spendResetsAt,
          reached: candidate.spendControlReached === true,
        }
      : undefined;
  if (
    windows.length === 0 &&
    Object.keys(credits).length === 0 &&
    !spendControl &&
    candidate.spendControlReached === undefined &&
    !text(candidate.rateLimitReachedType)
  ) {
    return undefined;
  }
  return {
    id,
    label: text(candidate.limitName) ?? id,
    primary: id === primaryId,
    windows,
    ...(typeof credits.hasCredits === "boolean" &&
    typeof credits.unlimited === "boolean"
      ? {
          credits: {
            hasCredits: credits.hasCredits,
            unlimited: credits.unlimited,
            ...(text(credits.balance) ? { balance: text(credits.balance) } : {}),
          },
        }
      : {}),
    ...(spendControl ? { spendControl } : {}),
    ...(typeof candidate.spendControlReached === "boolean"
      ? { spendControlReached: candidate.spendControlReached }
      : {}),
    ...(text(candidate.rateLimitReachedType)
      ? { limitReachedType: text(candidate.rateLimitReachedType) }
      : {}),
  };
}

function normalizeMeters(value: unknown): ProviderUsageMeterV1[] {
  const response = record(value);
  const legacy = record(response.rateLimits);
  const primaryId = text(legacy.limitId) ?? "codex";
  const byId = record(response.rateLimitsByLimitId);
  const entries = new Map<string, JsonRecord>();
  for (const [id, raw] of Object.entries(byId)) {
    entries.set(id, record(raw));
  }
  if (Object.keys(legacy).length > 0) {
    entries.set(primaryId, {
      ...legacy,
      ...entries.get(primaryId),
    });
  }
  return [...entries.entries()]
    .map(([id, candidate]) => meter(id, candidate, primaryId))
    .filter((entry): entry is ProviderUsageMeterV1 => entry !== undefined)
    .sort((left, right) => {
      if (left.primary !== right.primary) return left.primary ? -1 : 1;
      return left.label.localeCompare(right.label);
    });
}

function normalizeAccount(value: unknown): ProviderUsageSnapshotV1["account"] {
  const account = record(record(value).account);
  const type = text(account.type);
  if (!type) return null;
  return {
    type,
    ...(text(account.planType) ? { plan: text(account.planType) } : {}),
  };
}

function normalizeAnalytics(value: unknown): ProviderUsageAnalyticsV1 {
  const response = record(value);
  const summary = record(response.summary);
  const dailyUsage = Array.isArray(response.dailyUsageBuckets)
    ? response.dailyUsageBuckets.flatMap((entry) => {
        const bucket = record(entry);
        const startDate = text(bucket.startDate);
        const tokens = finiteInteger(bucket.tokens);
        return startDate && tokens !== undefined
          ? [{ startDate, tokens }]
          : [];
      })
    : undefined;
  return {
    ...(finiteInteger(summary.lifetimeTokens) === undefined
      ? {}
      : { lifetimeTokens: finiteInteger(summary.lifetimeTokens) }),
    ...(finiteInteger(summary.peakDailyTokens) === undefined
      ? {}
      : { peakDailyTokens: finiteInteger(summary.peakDailyTokens) }),
    ...(finiteInteger(summary.longestRunningTurnSec) === undefined
      ? {}
      : {
          longestRunningTurnSeconds: finiteInteger(
            summary.longestRunningTurnSec,
          ),
        }),
    ...(finiteInteger(summary.currentStreakDays) === undefined
      ? {}
      : { currentStreakDays: finiteInteger(summary.currentStreakDays) }),
    ...(finiteInteger(summary.longestStreakDays) === undefined
      ? {}
      : { longestStreakDays: finiteInteger(summary.longestStreakDays) }),
    ...(dailyUsage ? { dailyUsage } : {}),
  };
}

export type CodexProviderUsageReaderOptions = {
  runtime?: CodexAppServerRuntime;
  now?: () => Date;
};

export class CodexProviderUsageReader implements ProviderUsageReader {
  readonly providerId = "codex";
  readonly providerLabel = "Codex";
  private readonly runtime: CodexAppServerRuntime;
  private readonly now: () => Date;

  constructor(options: CodexProviderUsageReaderOptions = {}) {
    this.runtime = options.runtime ?? new CodexAppServerRuntime();
    this.now = options.now ?? (() => new Date());
  }

  async readUsage(
    options: Parameters<ProviderUsageReader["readUsage"]>[0] = {},
  ): Promise<ProviderUsageSnapshotV1> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const includeAnalytics = options.detail === "full";
    const [accountResult, limitsResult, analyticsResult] =
      await Promise.allSettled([
        this.runtime.readAccount(timeoutMs),
        this.runtime.readAccountRateLimits(timeoutMs),
        includeAnalytics
          ? this.runtime.readAccountTokenUsage(timeoutMs)
          : Promise.resolve(undefined),
      ]);
    const issues: ProviderUsageIssueV1[] = [];
    const account =
      accountResult.status === "fulfilled"
        ? normalizeAccount(accountResult.value)
        : null;
    if (accountResult.status === "rejected") {
      issues.push(issue(
        "CODEX_ACCOUNT_UNAVAILABLE",
        `Codex account details are unavailable: ${safeError(accountResult.reason)}`,
        "warning",
      ));
    } else if (!account) {
      issues.push(issue(
        record(accountResult.value).requiresOpenaiAuth === true
          ? "CODEX_AUTH_REQUIRED"
          : "CODEX_ACCOUNT_UNAVAILABLE",
        record(accountResult.value).requiresOpenaiAuth === true
          ? "Codex login is required before account usage can be read."
          : "Codex did not return account details.",
        "warning",
      ));
    }

    const meters =
      limitsResult.status === "fulfilled"
        ? normalizeMeters(limitsResult.value)
        : [];
    if (limitsResult.status === "rejected") {
      issues.push(issue(
        "CODEX_RATE_LIMITS_UNAVAILABLE",
        `Codex quota data is unavailable: ${safeError(limitsResult.reason)}`,
        "error",
      ));
    } else if (meters.length === 0) {
      issues.push(issue(
        "CODEX_RATE_LIMITS_EMPTY",
        "Codex returned no usable quota meters for this account.",
        "error",
      ));
    }

    let analytics: ProviderUsageAnalyticsV1 | undefined;
    if (includeAnalytics && analyticsResult.status === "rejected") {
      issues.push(issue(
        "CODEX_ANALYTICS_UNAVAILABLE",
        `Codex lifetime usage is unavailable: ${safeError(analyticsResult.reason)}`,
        "warning",
      ));
    } else if (
      includeAnalytics &&
      analyticsResult.status === "fulfilled" &&
      analyticsResult.value !== undefined
    ) {
      analytics = normalizeAnalytics(analyticsResult.value);
    }

    return {
      schemaVersion: 1,
      kind: "orynt_provider_usage",
      generatedAt: this.now().toISOString(),
      status:
        meters.length === 0
          ? "unavailable"
          : issues.length > 0
            ? "degraded"
            : "ready",
      provider: {
        id: this.providerId,
        label: this.providerLabel,
        transport: "app_server",
      },
      account,
      meters,
      ...(analytics ? { analytics } : {}),
      issues,
    };
  }
}
