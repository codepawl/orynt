import { describe, expect, it } from "bun:test";
import type { ProviderUsageSnapshotV1 } from "@codepawl/model-runtime";

import {
  providerUsageExitCode,
  providerUsageSummary,
  renderProviderUsage,
} from "./usage";

function snapshot(
  overrides: Partial<ProviderUsageSnapshotV1> = {},
): ProviderUsageSnapshotV1 {
  return {
    schemaVersion: 1,
    kind: "orynt_provider_usage",
    generatedAt: "2026-08-04T00:00:00.000Z",
    status: "ready",
    provider: {
      id: "codex",
      label: "Codex",
      transport: "app_server",
    },
    account: {
      type: "chatgpt",
      plan: "pro",
    },
    meters: [{
      id: "codex",
      label: "Codex",
      primary: true,
      windows: [
        {
          id: "primary",
          label: "7d",
          usedPercent: 89,
          remainingPercent: 11,
          windowDurationMinutes: 10_080,
          resetsAt: "2026-08-08T12:30:00.000Z",
        },
        {
          id: "secondary",
          label: "5h",
          usedPercent: 25,
          remainingPercent: 75,
          windowDurationMinutes: 300,
          resetsAt: "2026-08-04T03:00:00.000Z",
        },
      ],
      credits: {
        hasCredits: false,
        unlimited: false,
        balance: "0",
      },
      spendControlReached: false,
    }],
    analytics: {
      lifetimeTokens: 1_234,
      peakDailyTokens: 456,
      currentStreakDays: 4,
      longestStreakDays: 9,
      longestRunningTurnSeconds: 78,
      dailyUsage: [{ startDate: "2026-08-03", tokens: 100 }],
    },
    issues: [],
    ...overrides,
  };
}

describe("provider usage presentation", () => {
  it("renders actionable quota data and hides lifetime statistics by default", () => {
    const output = renderProviderUsage(snapshot(), {
      color: false,
      width: 100,
      now: new Date("2026-08-04T00:00:00.000Z"),
    });

    expect(output).toContain("Codex usage · ready");
    expect(output).toContain("7d  89% used · 11% left");
    expect(output).toContain("2026-08-08 12:30 UTC · in 4d 12h");
    expect(output).toContain("Credits  none");
    expect(output).not.toContain("Lifetime usage");
  });

  it("renders lifetime summary in verbose mode without dumping daily rows", () => {
    const output = renderProviderUsage(snapshot(), {
      color: false,
      verbose: true,
      width: 100,
    });

    expect(output).toContain("Lifetime usage");
    expect(output).toContain("Tokens          1,234");
    expect(output).not.toContain("2026-08-03");
  });

  it("wraps narrow output and terminal-escapes provider values", () => {
    const output = renderProviderUsage(snapshot({
      provider: {
        id: "codex",
        label: "Codex\u001b[31m",
        transport: "app_server",
      },
      issues: [{
        code: "TEST",
        message: "A deliberately long warning with \u001b[2J terminal control content",
        severity: "warning",
      }],
    }), {
      color: false,
      width: 44,
    });

    expect(output).toContain("\\u001b[31m");
    expect(output).toContain("\\u001b[2J");
    expect(output).not.toContain("\u001b[31m");
    expect(output.split("\n").every((line) => line.length <= 50)).toBe(true);
  });

  it("provides a compact primary-meter summary and stable exit codes", () => {
    expect(providerUsageSummary(snapshot())).toBe(
      "Codex · pro · 7d 11% left · 5h 75% left",
    );
    expect(providerUsageExitCode(snapshot())).toBe(0);
    expect(providerUsageExitCode(snapshot({ status: "degraded" }))).toBe(1);
    expect(providerUsageExitCode(snapshot({
      status: "unavailable",
      meters: [],
    }))).toBe(1);
  });
});
