import { describe, expect, it } from "bun:test";

import { bindPromptUnderstandingCandidate } from "@codepawl/shared";

import {
  controlledPromptUnderstandingCandidate,
  createPromptUnderstandingBenchmarkReport,
  createPromptUnderstandingScenarios,
} from "./promptUnderstandingBench";

describe("prompt understanding benchmark", () => {
  it("defines thirty balanced, bounded scenarios", () => {
    const scenarios = createPromptUnderstandingScenarios();
    expect(scenarios).toHaveLength(30);
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(30);
    expect(scenarios.filter((scenario) => scenario.followUp)).toHaveLength(4);
    expect(scenarios.filter((scenario) => scenario.safetyBoundary).length).toBeGreaterThanOrEqual(5);
  });

  it("passes every release gate for controlled oracle results", () => {
    const scenarios = createPromptUnderstandingScenarios();
    const repetitions = 2;
    const trials = scenarios.flatMap((scenario) =>
      Array.from({ length: repetitions }, (_, index) => ({
        scenarioId: scenario.id,
        repetition: index + 1,
        status: "completed" as const,
        result: bindPromptUnderstandingCandidate(
          controlledPromptUnderstandingCandidate(scenario),
          scenario.basis,
          scenario.context,
        ),
        durationMs: 1,
      })));
    const report = createPromptUnderstandingBenchmarkReport(
      scenarios,
      trials,
      repetitions,
    );
    expect(report.gates).toEqual({
      validOutputs: true,
      outcomeReadiness: true,
      followUp: true,
      clarification: true,
      safetyBoundary: true,
      noScopeExpansion: true,
      passed: true,
    });
  });

  it("fails closed quality gates for invalid and scope-expanding results", () => {
    const [scenario] = createPromptUnderstandingScenarios();
    const report = createPromptUnderstandingBenchmarkReport(
      [scenario],
      [{
        scenarioId: scenario.id,
        repetition: 1,
        status: "invalid",
        result: null,
        error: "invalid output",
        durationMs: 1,
      }],
      1,
    );
    expect(report.gates.validOutputs).toBe(false);
    expect(report.gates.passed).toBe(false);
  });
});
