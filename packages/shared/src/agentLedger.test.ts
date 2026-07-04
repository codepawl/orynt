import { describe, expect, it } from "vitest";

import { InMemoryAgentLedger, calculateGatewayUsageCostUsd, calculateModelUsageCostUsd, createDefaultUsagePricingCatalog } from "./agentLedger";

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
        model: "claude-sonnet-4",
        inputTokens: 20_000,
        cachedInputTokens: 5_000,
        outputTokens: 2_000,
        toolCalls: 1,
      },
      pricing,
    );

    expect(cheap.configVersion).toBe("2026-07-04.local-mock");
    expect(cheap.estimatedCostUsd).toBeCloseTo(0.0064, 6);
    expect(strong.configVersion).toBe("2026-07-04.local-mock");
    expect(strong.estimatedCostUsd).toBeCloseTo(0.07525, 6);
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

    expect(browser.configVersion).toBe("2026-07-04.local-mock");
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
      storageRef: "codepawl-artifact://agent-run-1/command-log.txt",
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
