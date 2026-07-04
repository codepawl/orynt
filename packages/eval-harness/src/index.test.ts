import { describe, expect, it } from "vitest";

import { CodePawlEvalRunner, createDefaultEvalSuite } from "./index";

describe("CodePawlEvalRunner", () => {
  it("runs deterministic safety, memory, and cost scenarios with full evidence coverage", () => {
    const suite = createDefaultEvalSuite({
      workspaceId: "workspace-eval",
      repositoryPath: "/repo/codepawl",
    });
    const groupIds = suite.scenarios.map((scenario) => scenario.group);

    expect(groupIds).toEqual(
      expect.arrayContaining([
        "safe_read_only",
        "low_risk_state_change",
        "sensitive_action",
        "blocked_action",
        "prompt_injection",
        "memory_regression",
        "cost_regression",
      ]),
    );

    const result = new CodePawlEvalRunner().runSuite(suite);

    expect(result.metrics.scenarioCount).toBeGreaterThanOrEqual(7);
    expect(result.metrics.successRate).toBe(1);
    expect(result.metrics.permissionCoverage).toBe(1);
    expect(result.metrics.blockedExecutionCount).toBeGreaterThanOrEqual(3);
    expect(result.metrics.interventionCount).toBeGreaterThanOrEqual(3);
    expect(result.metrics.retryRate).toBe(0);
    expect(result.metrics.loopRate).toBe(0);
    expect(result.metrics.p50CostUsd).toBeGreaterThan(0);
    expect(result.metrics.p90CostUsd).toBeGreaterThanOrEqual(result.metrics.p50CostUsd);
    expect(result.metrics.evidenceCoverage).toBe(1);
    expect(result.metrics.memorySourceCoverage).toBe(1);
    expect(result.metrics.skillApprovalBeforeUse).toBe(1);
    expect(result.results.filter((item) => item.executed && item.policyDecision.decision === "block")).toHaveLength(0);
    expect(result.results.filter((item) => item.promptInjectionDetected)).toHaveLength(1);
    expect(result.results.filter((item) => item.memoryItems.every((memory) => memory.provenance.sources.length > 0))).toHaveLength(result.results.length);
  });

  it("emits machine-readable JSON and human-readable Markdown reports", () => {
    const result = new CodePawlEvalRunner().runSuite(createDefaultEvalSuite());

    expect(JSON.parse(result.reports.json)).toMatchObject({
      suiteId: "codepawl-deterministic-mvp-evals",
      metrics: {
        scenarioCount: result.metrics.scenarioCount,
        evidenceCoverage: 1,
      },
    });
    expect(result.reports.markdown).toContain("# CodePawl Evaluation Report");
    expect(result.reports.markdown).toContain("| Success rate | 100.00% |");
    expect(result.reports.markdown).toContain("## Scenario Results");
    expect(result.reports.markdown).toContain("prompt-injection-secret-exfiltration");
  });

  it("computes execution from policy behavior instead of expected fixture values", () => {
    const suite = createDefaultEvalSuite();
    suite.scenarios = [
      {
        ...suite.scenarios[0],
        id: "allowed-command-with-wrong-expectation",
        expected: {
          ...suite.scenarios[0].expected,
          decision: "allow",
          executed: false,
        },
      },
    ];

    const result = new CodePawlEvalRunner().runSuite(suite);

    expect(result.results[0]).toMatchObject({
      policyDecision: { decision: "allow" },
      executed: true,
      passed: false,
    });
    expect(result.metrics.successRate).toBe(0);
  });
});
