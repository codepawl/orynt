import { describe, expect, it } from "bun:test";

import {
  bindPromptUnderstandingCandidate,
  classifyDeterministicPromptUnderstanding,
} from "@codepawl/shared";

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

  it("never lets the deterministic gate skip a prompt the oracle marks not ready", () => {
    const skipped = createPromptUnderstandingScenarios().filter((scenario) =>
      classifyDeterministicPromptUnderstanding(scenario.basis, scenario.context)
        .bypass
    );

    // This is the acceptance bar for skipping the model gate: a bypass that
    // swallows a clarification, an assumption, or a takeover is a defect, not a
    // tuning parameter. Every skipped scenario must be one the model gate would
    // also have returned as a ready answer.
    for (const scenario of skipped) {
      expect(scenario.oracle).toEqual({ outcome: "answer", readiness: "ready" });
      expect(scenario.followUp).toBe(false);
      expect(scenario.safetyBoundary).toBe(false);
    }
  });

  it("still answers the bounded read-only questions without a provider call", () => {
    const scenarios = createPromptUnderstandingScenarios();
    const bypassed = scenarios.filter((scenario) =>
      classifyDeterministicPromptUnderstanding(scenario.basis, scenario.context)
        .bypass
    );

    // Coverage is what makes the change worth making; the test above is what
    // makes it safe. Both matter, so both are pinned.
    expect(bypassed.map((scenario) => scenario.id).sort()).toEqual([
      "answer-compare",
      "answer-explain",
      "answer-purpose",
      "answer-status",
      "answer-summary",
    ]);
  });

  it("keeps the model gate for every ambiguous, referential, or unsafe prompt", () => {
    const reasons = new Map(
      createPromptUnderstandingScenarios().map((scenario) => [
        scenario.id,
        classifyDeterministicPromptUnderstanding(
          scenario.basis,
          scenario.context,
        ),
      ]),
    );

    for (
      const id of [
        "clarify-scope",
        "assume-surface",
        "takeover-host",
        "takeover-secret",
        "followup-desktop",
        "injection-context",
        "injection-prompt",
        "ready-file",
      ]
    ) {
      expect(reasons.get(id)).toMatchObject({ bypass: false });
    }
  });

  it("produces only a ready answer with no questions or assumptions", () => {
    const [purpose] = createPromptUnderstandingScenarios();
    const decision = classifyDeterministicPromptUnderstanding(
      purpose!.basis,
      purpose!.context,
    );

    expect(decision.bypass).toBe(true);
    if (!decision.bypass) return;
    expect(decision.candidate.outcome).toBe("answer");
    expect(decision.candidate.readiness).toBe("ready");
    expect(decision.candidate.questions).toEqual([]);
    expect(decision.candidate.assumptions).toEqual([]);
    expect(decision.candidate.refinedBrief).toBeNull();
    // The candidate must survive the same binding and validation the model
    // gate's output goes through, or it is not interchangeable with it.
    expect(
      bindPromptUnderstandingCandidate(
        decision.candidate,
        purpose!.basis,
        purpose!.context,
      ).readiness,
    ).toBe("ready");
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
