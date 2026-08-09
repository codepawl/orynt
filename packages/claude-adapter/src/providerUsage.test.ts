import { describe, expect, it } from "bun:test";

import {
  ClaudeProviderUsageReader,
  ClaudeRateLimitRecorder,
  parseClaudeRateLimitHeaders,
} from "./providerUsage";

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe("claude rate-limit header parsing", () => {
  it("discovers families from the headers rather than a fixed list", () => {
    const observation = parseClaudeRateLimitHeaders(
      headers({
        "anthropic-ratelimit-requests-limit": "1000",
        "anthropic-ratelimit-requests-remaining": "250",
        "anthropic-ratelimit-requests-reset": "2026-08-08T12:00:00Z",
        "anthropic-ratelimit-future-thing-limit": "10",
        "anthropic-ratelimit-future-thing-remaining": "10",
      }),
      "2026-08-08T11:00:00Z",
    )!;
    expect(observation.windows.map((window) => window.id)).toEqual([
      "future-thing",
      "requests",
    ]);
    expect(observation.windows[1]).toEqual({
      id: "requests",
      label: "Requests",
      limit: 1_000,
      remaining: 250,
      resetsAt: "2026-08-08T12:00:00Z",
    });
  });

  it("skips a family missing its remaining counter", () => {
    const observation = parseClaudeRateLimitHeaders(
      headers({
        "anthropic-ratelimit-tokens-limit": "100",
        "anthropic-ratelimit-requests-limit": "10",
        "anthropic-ratelimit-requests-remaining": "9",
      }),
      "t",
    )!;
    expect(observation.windows.map((window) => window.id)).toEqual([
      "requests",
    ]);
  });

  it("captures retry-after even with no rate-limit family present", () => {
    const observation = parseClaudeRateLimitHeaders(
      headers({ "retry-after": "3" }),
      "t",
    )!;
    expect(observation.retryAfterMs).toBe(3_000);
    expect(observation.windows).toEqual([]);
  });

  it("returns nothing when the response carries no usage signal", () => {
    expect(
      parseClaudeRateLimitHeaders(headers({ "content-type": "text/plain" }), "t"),
    ).toBeUndefined();
  });
});

describe("claude provider usage reader", () => {
  it("reports unavailable before any turn has run", async () => {
    const snapshot = await new ClaudeProviderUsageReader({
      recorder: new ClaudeRateLimitRecorder(),
      now: () => new Date("2026-08-08T00:00:00Z"),
    }).readUsage();
    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.meters).toEqual([]);
    expect(snapshot.account).toBeNull();
    expect(snapshot.issues[0]!.code).toBe("CLAUDE_USAGE_LIMITED");
  });

  it("reports degraded with observed windows once a turn has run", async () => {
    const recorder = new ClaudeRateLimitRecorder();
    recorder.record(
      headers({
        "anthropic-ratelimit-requests-limit": "1000",
        "anthropic-ratelimit-requests-remaining": "250",
        "anthropic-ratelimit-input-tokens-limit": "80000",
        "anthropic-ratelimit-input-tokens-remaining": "80000",
      }),
      "2026-08-08T11:00:00Z",
    );
    const snapshot = await new ClaudeProviderUsageReader({
      recorder,
      now: () => new Date("2026-08-08T11:30:00Z"),
    }).readUsage();
    expect(snapshot.status).toBe("degraded");
    expect(snapshot.meters.map((meter) => meter.id)).toEqual([
      "input-tokens",
      "requests",
    ]);
    expect(snapshot.meters[1]!.windows[0]).toMatchObject({
      usedPercent: 75,
      remainingPercent: 25,
    });
    // Only the first meter is primary, so the composer has one headline.
    expect(snapshot.meters.filter((meter) => meter.primary)).toHaveLength(1);
  });

  it("never invents credits or spend controls", async () => {
    const recorder = new ClaudeRateLimitRecorder();
    recorder.record(
      headers({
        "anthropic-ratelimit-requests-limit": "10",
        "anthropic-ratelimit-requests-remaining": "10",
      }),
    );
    const snapshot = await new ClaudeProviderUsageReader({ recorder }).readUsage();
    for (const meter of snapshot.meters) {
      expect(meter).not.toHaveProperty("credits");
      expect(meter).not.toHaveProperty("spendControl");
    }
    expect(snapshot).not.toHaveProperty("analytics");
  });

  it("keeps the last usable observation when a later response carries none", () => {
    const recorder = new ClaudeRateLimitRecorder();
    recorder.record(
      headers({
        "anthropic-ratelimit-requests-limit": "10",
        "anthropic-ratelimit-requests-remaining": "4",
      }),
      "first",
    );
    recorder.record(headers({ "content-type": "application/json" }), "second");
    expect(recorder.read()!.observedAt).toBe("first");
  });
});
