import { describe, expect, it, vi } from "bun:test";

import { CodexAppServerRuntime } from "./appServer";
import { CodexProviderUsageReader } from "./providerUsage";

function runtime(
  overrides: Partial<{
    readAccount: () => Promise<unknown>;
    readAccountRateLimits: () => Promise<unknown>;
    readAccountTokenUsage: () => Promise<unknown>;
  }> = {},
): CodexAppServerRuntime {
  return {
    readAccount: vi.fn(async () => ({
      account: {
        type: "chatgpt",
        email: "private@example.test",
        planType: "pro",
      },
      requiresOpenaiAuth: true,
    })),
    readAccountRateLimits: vi.fn(async () => ({
      rateLimits: {
        limitId: "codex",
        planType: "pro",
        primary: {
          usedPercent: 89,
          windowDurationMins: 10_080,
          resetsAt: 1_786_165_801,
        },
        credits: {
          hasCredits: false,
          unlimited: false,
          balance: "0",
        },
        spendControlReached: false,
      },
      rateLimitsByLimitId: {
        codex: {
          limitId: "codex",
          primary: {
            usedPercent: 89,
            windowDurationMins: 10_080,
            resetsAt: 1_786_165_801,
          },
        },
        codex_fast: {
          limitId: "codex_fast",
          limitName: "Fast models",
          primary: {
            usedPercent: 25,
            windowDurationMins: 300,
            resetsAt: 1_786_100_000,
          },
        },
      },
    })),
    readAccountTokenUsage: vi.fn(async () => ({
      summary: {
        lifetimeTokens: 1_234,
        peakDailyTokens: 456,
        longestRunningTurnSec: 78,
        currentStreakDays: 4,
        longestStreakDays: 9,
      },
      dailyUsageBuckets: [
        { startDate: "2026-08-03", tokens: 100 },
        { startDate: "invalid" },
      ],
    })),
    ...overrides,
  } as unknown as CodexAppServerRuntime;
}

describe("CodexProviderUsageReader", () => {
  it("normalizes every quota meter without exposing account email", async () => {
    const reader = new CodexProviderUsageReader({
      runtime: runtime(),
      now: () => new Date("2026-08-04T00:00:00.000Z"),
    });

    const snapshot = await reader.readUsage({ detail: "full" });

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      kind: "orynt_provider_usage",
      generatedAt: "2026-08-04T00:00:00.000Z",
      status: "ready",
      provider: {
        id: "codex",
        label: "Codex",
        transport: "app_server",
      },
      account: { type: "chatgpt", plan: "pro" },
      analytics: {
        lifetimeTokens: 1_234,
        peakDailyTokens: 456,
        longestRunningTurnSeconds: 78,
        currentStreakDays: 4,
        longestStreakDays: 9,
        dailyUsage: [{ startDate: "2026-08-03", tokens: 100 }],
      },
      issues: [],
    });
    expect(JSON.stringify(snapshot)).not.toContain("private@example.test");
    expect(snapshot.meters).toEqual([
      expect.objectContaining({
        id: "codex",
        primary: true,
        credits: {
          hasCredits: false,
          unlimited: false,
          balance: "0",
        },
        spendControlReached: false,
        windows: [
          expect.objectContaining({
            id: "primary",
            label: "7d",
            usedPercent: 89,
            remainingPercent: 11,
          }),
        ],
      }),
      expect.objectContaining({
        id: "codex_fast",
        label: "Fast models",
        primary: false,
        windows: [
          expect.objectContaining({
            label: "5h",
            usedPercent: 25,
            remainingPercent: 75,
          }),
        ],
      }),
    ]);
  });

  it("does not request lifetime analytics for quota-only reads", async () => {
    const current = runtime();
    const reader = new CodexProviderUsageReader({ runtime: current });

    const snapshot = await reader.readUsage({ detail: "quota" });

    expect(current.readAccountTokenUsage).not.toHaveBeenCalled();
    expect(snapshot.analytics).toBeUndefined();
    expect(snapshot.status).toBe("ready");
  });

  it("retains usable quotas when optional analytics fail", async () => {
    const reader = new CodexProviderUsageReader({
      runtime: runtime({
        readAccountTokenUsage: vi.fn(async () => {
          throw new Error("analytics unavailable");
        }),
      }),
    });

    const snapshot = await reader.readUsage({ detail: "full" });

    expect(snapshot.status).toBe("degraded");
    expect(snapshot.meters).toHaveLength(2);
    expect(snapshot.issues).toContainEqual(expect.objectContaining({
      code: "CODEX_ANALYTICS_UNAVAILABLE",
      severity: "warning",
    }));
  });

  it("returns an unavailable snapshot when no quota meter is usable", async () => {
    const reader = new CodexProviderUsageReader({
      runtime: runtime({
        readAccount: vi.fn(async () => ({
          account: null,
          requiresOpenaiAuth: true,
        })),
        readAccountRateLimits: vi.fn(async () => ({
          rateLimits: {},
          rateLimitsByLimitId: null,
        })),
      }),
    });

    const snapshot = await reader.readUsage();

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.account).toBeNull();
    expect(snapshot.meters).toEqual([]);
    expect(snapshot.issues.map(({ code }) => code)).toEqual([
      "CODEX_AUTH_REQUIRED",
      "CODEX_RATE_LIMITS_EMPTY",
    ]);
  });
});
