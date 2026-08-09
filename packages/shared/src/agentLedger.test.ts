import { describe, expect, it } from "bun:test";

import { InMemoryAgentLedger, calculateCacheHitRatio, calculateFreshInputTokens, calculateGatewayUsageCostUsd, calculateModelUsageCostUsd, createDefaultUsagePricingCatalog, estimateInvocationCostUsd, estimateModelUsageCostUsd, usagePricingProviderId } from "./agentLedger";

describe("Prompt token accounting", () => {
  it("separates the prompt a provider processed fresh from the whole prompt", () => {
    const usage = { inputTokens: 606_875, cachedInputTokens: 520_000 };

    expect(calculateFreshInputTokens(usage)).toBe(86_875);
    expect(calculateCacheHitRatio(usage)).toBeCloseTo(0.857, 3);
  });

  it("lets better cache reuse reduce the fresh count while the whole prompt grows", () => {
    const uncached = { inputTokens: 200_000, cachedInputTokens: 0 };
    const cached = { inputTokens: 240_000, cachedInputTokens: 220_000 };

    // The whole prompt grew, so a budget compared against `inputTokens` would
    // read this as a regression. Fresh tokens show the real direction.
    expect(cached.inputTokens).toBeGreaterThan(uncached.inputTokens);
    expect(calculateFreshInputTokens(cached)).toBeLessThan(
      calculateFreshInputTokens(uncached),
    );
  });

  it("reports no cache ratio when no prompt tokens were measured", () => {
    expect(calculateCacheHitRatio({ inputTokens: 0, cachedInputTokens: 0 }))
      .toBeNull();
  });

  it("clamps a cached count that exceeds the whole prompt", () => {
    const usage = { inputTokens: 1_000, cachedInputTokens: 4_000 };

    expect(calculateFreshInputTokens(usage)).toBe(0);
    expect(calculateCacheHitRatio(usage)).toBe(1);
  });
});

describe("Advisory invocation cost", () => {
  it("prices a catalogued model and leaves an uncatalogued one unpriced", () => {
    const pricing = createDefaultUsagePricingCatalog();

    expect(
      estimateModelUsageCostUsd(
        {
          provider: "anthropic",
          model: "claude-haiku-4-5",
          inputTokens: 10_000,
          cachedInputTokens: 0,
          outputTokens: 1_000,
          toolCalls: 0,
        },
        pricing,
      )?.estimatedCostUsd,
    ).toBeCloseTo(0.015, 6);
    expect(
      estimateModelUsageCostUsd(
        {
          provider: "openai",
          model: "gpt-5.6-luna",
          inputTokens: 10_000,
          cachedInputTokens: 0,
          outputTokens: 1_000,
          toolCalls: 0,
        },
        pricing,
      ),
    ).toBeNull();
  });

  it("maps API provider ids onto catalog providers and leaves Codex unpriced", () => {
    expect(usagePricingProviderId("anthropic-api")).toBe("anthropic");
    expect(usagePricingProviderId("openai-api")).toBe("openai");
    // Codex bills against a subscription, so a per-token estimate would be a
    // confident wrong number rather than a missing one.
    expect(usagePricingProviderId("codex-cli")).toBe("codex-cli");
    expect(
      estimateInvocationCostUsd({
        providerId: "codex-cli",
        modelId: "gpt-4.1-mini",
        inputTokens: 10_000,
        outputTokens: 1_000,
      }),
    ).toBeNull();
  });

  it("charges cached prompt tokens at the cache rate", () => {
    const uncached = estimateInvocationCostUsd({
      providerId: "anthropic-api",
      modelId: "claude-haiku-4-5",
      inputTokens: 100_000,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
    const cached = estimateInvocationCostUsd({
      providerId: "anthropic-api",
      modelId: "claude-haiku-4-5",
      inputTokens: 100_000,
      cachedInputTokens: 100_000,
      outputTokens: 0,
    });

    expect(uncached).toBeCloseTo(0.1, 6);
    expect(cached).toBeCloseTo(0.01, 6);
  });

  it("never prices a subscription provider, however much it reports", () => {
    // A flat-fee plan spends no money per token. Pricing one from the catalog
    // would report a charge that never happened, which is worse than silence.
    for (const providerId of ["codex-cli", "opencode-api"]) {
      expect(
        estimateInvocationCostUsd({
          providerId,
          modelId: "claude-haiku-4-5",
          inputTokens: 500_000,
          cachedInputTokens: 0,
          outputTokens: 50_000,
        }),
      ).toBeNull();
    }
  });

  it("keeps pricing the per-token providers", () => {
    expect(
      estimateInvocationCostUsd({
        providerId: "anthropic-api",
        modelId: "claude-haiku-4-5",
        inputTokens: 100_000,
        cachedInputTokens: 0,
        outputTokens: 0,
      }),
    ).toBeCloseTo(0.1, 6);
  });

  it("reports no estimate when the provider reported no usage", () => {
    expect(
      estimateInvocationCostUsd({
        providerId: "anthropic-api",
        modelId: "claude-haiku-4-5",
        inputTokens: null,
        outputTokens: null,
      }),
    ).toBeNull();
  });
});

describe("Agent ledger and cost tracking", () => {
  it("calculates model costs from versioned provider pricing configs", () => {
    const pricing = createDefaultUsagePricingCatalog();

    const cheap = calculateModelUsageCostUsd(
      {
        provider: "openai",
        model: "gpt-4.1-mini",
        inputTokens: 10_000,
        cachedInputTokens: 2_000,
        outputTokens: 1_000,
        toolCalls: 3,
      },
      pricing,
    );
    const strong = calculateModelUsageCostUsd(
      {
        provider: "anthropic",
        model: "claude-sonnet-5",
        inputTokens: 20_000,
        cachedInputTokens: 5_000,
        outputTokens: 2_000,
        toolCalls: 1,
      },
      pricing,
    );

    expect(cheap.configVersion).toBe("2026-08-08.local-mock");
    expect(cheap.estimatedCostUsd).toBeCloseTo(0.0064, 6);
    expect(strong.configVersion).toBe("2026-08-08.local-mock");
    expect(strong.estimatedCostUsd).toBeCloseTo(0.077, 6);
  });

  it("calculates gateway usage from runtime pricing configs", () => {
    const pricing = createDefaultUsagePricingCatalog();

    const browser = calculateGatewayUsageCostUsd(
      {
        gatewayType: "browser",
        actionType: "dom_read",
        durationMs: 90_000,
        transferredMb: 12,
        storageGbDay: 0.5,
        requestCount: 8,
      },
      pricing,
    );

    expect(browser.configVersion).toBe("2026-08-08.local-mock");
    expect(browser.estimatedCostUsd).toBeCloseTo(0.0013535, 8);
  });

  it("records run metadata, append-only events, permissions, artifacts, usage, and monthly summaries", () => {
    const ledger = new InMemoryAgentLedger(createDefaultUsagePricingCatalog());
    const run = ledger.createRun({
      id: "agent-run-1",
      workspaceId: "workspace-alpha",
      userId: "user-alpha",
      planId: "managed-ai",
      userGoal: "Create a draft supplier report",
      normalizedGoal: "draft_supplier_report",
      taskType: "research",
      riskLevel: "review",
      primaryModelProvider: "openai",
      primaryModelName: "gpt-4.1-mini",
      startedAt: "2026-07-04T01:00:00.000Z",
    });

    ledger.appendEvent(run.id, {
      id: "event-1",
      eventType: "task.created",
      payloadJson: { summary: "Run created" },
      visibility: "user",
      createdAt: "2026-07-04T01:00:00.000Z",
    });
    ledger.appendEvent(run.id, {
      id: "event-2",
      eventType: "permission.requested",
      payloadJson: { actionId: "action-send-email" },
      visibility: "admin",
      createdAt: "2026-07-04T01:00:01.000Z",
    });
    ledger.recordPermissionEvent({
      id: "permission-1",
      runId: run.id,
      actionId: "action-send-email",
      permissionTier: "sensitive",
      decision: "approval_requested",
      reason: "Sending an external email requires explicit approval.",
      policyVersion: "permission-policy-v1",
      requestedAt: "2026-07-04T01:00:01.000Z",
    });
    ledger.recordArtifact({
      id: "artifact-1",
      runId: run.id,
      eventId: "event-2",
      artifactType: "command_log",
      storageRef: "orynt-artifact://agent-run-1/command-log.txt",
      sha256: "abc123",
      visibility: "admin",
      createdAt: "2026-07-04T01:00:02.000Z",
    });
    ledger.recordModelUsage({
      id: "model-usage-1",
      runId: run.id,
      workspaceId: run.workspaceId,
      userId: run.userId,
      provider: "openai",
      model: "gpt-4.1-mini",
      inputTokens: 10_000,
      cachedInputTokens: 2_000,
      outputTokens: 1_000,
      toolCalls: 3,
      createdAt: "2026-07-04T01:00:03.000Z",
    });
    ledger.recordGatewayUsage({
      id: "gateway-usage-1",
      runId: run.id,
      workspaceId: run.workspaceId,
      userId: run.userId,
      gatewayType: "browser",
      actionType: "dom_read",
      durationMs: 90_000,
      transferredMb: 12,
      storageGbDay: 0.5,
      requestCount: 8,
      createdAt: "2026-07-04T01:00:04.000Z",
    });

    const completed = ledger.completeRun(run.id, {
      endedAt: "2026-07-04T01:02:30.000Z",
      retryCount: 1,
      finalSummary: "Draft report created and left unsubmitted.",
      failureReason: null,
    });
    const summary = ledger.getMonthlyUsageSummary({
      workspaceId: "workspace-alpha",
      userId: "user-alpha",
      month: "2026-07",
      includeInternalCosts: false,
    });
    const adminSummary = ledger.getMonthlyUsageSummary({
      workspaceId: "workspace-alpha",
      userId: "user-alpha",
      month: "2026-07",
      includeInternalCosts: true,
    });

    expect(ledger.listEvents(run.id).map((event) => event.eventIndex)).toEqual([1, 2]);
    expect(completed.status).toBe("completed");
    expect(completed.durationSeconds).toBe(150);
    expect(completed.approvalCount).toBe(1);
    expect(completed.blockedActionCount).toBe(0);
    expect(completed.estimatedCostUsd).toBeCloseTo(0.0077535, 8);
    expect(completed.creditsConsumed).toBeCloseTo(0.0077535, 8);
    expect(summary.estimatedCostUsd).toBeUndefined();
    expect(summary.creditsConsumed).toBeCloseTo(0.0077535, 8);
    expect(summary.permissionDecisionCounts.approval_requested).toBe(1);
    expect(summary.artifactCount).toBe(1);
    expect(adminSummary.estimatedCostUsd).toBeCloseTo(0.0077535, 8);
  });
});
