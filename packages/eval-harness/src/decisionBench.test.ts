import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  DECISION_BENCH_METHODS,
  DECISION_BENCH_V3_METHODS,
  buildDecisionTrialSchedule,
  createDecisionBenchV1,
  createDecisionBenchmarkReport,
  createDecisionBenchmarkReportV2,
  createDecisionBenchmarkReportV3,
  decisionMatchesScenarioV2,
  decisionsEqual,
  normalizeDecision,
  renderDecisionProtocolPrompt,
  renderDecisionReportJson,
  renderDecisionReportMarkdown,
  renderDecisionTrialsJsonl,
  toModelVisibleScenario,
  type Decision,
  type DecisionTrial,
  type DecisionTrialResult,
} from "./decisionBench";

const scenarios = createDecisionBenchV1();

function result(
  trial: DecisionTrial,
  decision: Decision | null = scenarios.find((scenario) => scenario.id === trial.scenarioId)!.oracle,
  latency = trial.methodId === "orynt" ? 100 : 240,
  status: DecisionTrialResult["status"] = "completed",
): DecisionTrialResult {
  return {
    ...trial,
    status,
    decision,
    timing: {
      processStartedMs: 0,
      processReadyMs: 0,
      promptAcceptedMs: 10,
      providerDispatchedMs: 20,
      firstDeltaMs: 40,
      decisionCommittedMs: 10 + latency,
      finishedMs: 20 + latency,
    },
  };
}

describe("decision-v1 suite", () => {
  it("contains 32 unique scenarios balanced across decision kinds", async () => {
    expect(scenarios).toHaveLength(32);
    expect(new Set(scenarios.map((scenario) => scenario.id))).toHaveProperty("size", 32);
    for (const kind of ["respond", "clarify", "act", "refuse"] as const) {
      expect(scenarios.filter((scenario) => scenario.kind === kind)).toHaveLength(8);
    }
    const fixture = JSON.parse(await readFile(new URL("../fixtures/decision-v1.json", import.meta.url), "utf8"));
    expect(fixture).toMatchObject({ scenarioCount: 32, repetitions: 3, timeoutMs: 120_000 });
  });

  it("keeps kind and oracle out of model-visible scenario serialization", () => {
    const visible = toModelVisibleScenario(scenarios[0]);
    expect(visible).not.toHaveProperty("oracle");
    expect(visible).not.toHaveProperty("kind");
    expect(JSON.stringify(visible)).not.toContain('"answer":"Paris"');
    const protocol = renderDecisionProtocolPrompt(scenarios[0]);
    expect(protocol).not.toContain('"oracle"');
    expect(protocol).not.toContain('"kind":"respond"');
    expect(protocol).toContain("Do not add properties.");
  });
});

describe("decision trial schedule", () => {
  it("builds a deterministic, serial, counterbalanced schedule with 96 trials per method", () => {
    const schedule = buildDecisionTrialSchedule(scenarios, 3, 17);
    expect(schedule).toEqual(buildDecisionTrialSchedule(scenarios, 3, 17));
    expect(schedule).toHaveLength(192);
    expect(schedule.map((trial) => trial.sequence)).toEqual([...Array(192).keys()]);
    for (const methodId of DECISION_BENCH_METHODS) {
      expect(schedule.filter((trial) => trial.methodId === methodId)).toHaveLength(96);
    }
    const firstMethods = new Set<string>();
    for (let index = 0; index < schedule.length; index += 2) {
      const pair = schedule.slice(index, index + 2);
      expect(new Set(pair.map((trial) => trial.methodId))).toEqual(new Set(DECISION_BENCH_METHODS));
      expect(pair[0]!.scenarioId).toBe(pair[1]!.scenarioId);
      firstMethods.add(pair[0]!.methodId);
    }
    expect(firstMethods).toEqual(new Set(DECISION_BENCH_METHODS));
  });

  it("builds the v3 three-method paired schedule", () => {
    const schedule = buildDecisionTrialSchedule(
      scenarios,
      3,
      17,
      DECISION_BENCH_V3_METHODS,
    );
    expect(schedule).toHaveLength(288);
    for (const methodId of DECISION_BENCH_V3_METHODS) {
      expect(schedule.filter((trial) => trial.methodId === methodId)).toHaveLength(96);
    }
  });
});

describe("decision scoring and reporting", () => {
  it("normalizes Unicode, whitespace, and object key order but remains exact", () => {
    const expected = scenarios[0]!.oracle;
    expect(decisionsEqual(
      { ...expected, arguments: { ...expected.arguments!, answer: "  Ca\u0301t   Linh " } },
      { ...expected, arguments: { ...expected.arguments!, answer: "Cát Linh" } },
    )).toBe(true);
    expect(decisionsEqual(
      expected,
      { ...expected, arguments: { ...expected.arguments!, answer: "Lyon" } },
    )).toBe(false);
    expect(normalizeDecision({ ...expected, extra: true })).toBeNull();
    expect(normalizeDecision({ ...expected, arguments: { answer: "Paris" } })).toBeNull();
  });

  it("uses deterministic task-aware semantics in decision-v2", () => {
    const status = scenarios.find((scenario) => scenario.id === "respond-status")!;
    expect(decisionMatchesScenarioV2(status, {
      ...status.oracle,
      arguments: { ...status.oracle.arguments!, answer: "Ticket T-17 is closed." },
    })).toBe(true);
    const clarify = scenarios.find((scenario) => scenario.id === "clarify-message")!;
    expect(decisionMatchesScenarioV2(clarify, {
      ...clarify.oracle,
      arguments: {
        ...clarify.oracle.arguments!,
        recipient: "Mai",
      },
    })).toBe(true);
    const schedule = buildDecisionTrialSchedule(scenarios, 1);
    expect(createDecisionBenchmarkReportV2(
      scenarios,
      schedule.map((trial) => result(trial)),
    ).benchmarkId).toBe("decision-v2");
  });

  it("scores Responses as the primary v3 candidate and app-server as diagnostic", () => {
    const schedule = buildDecisionTrialSchedule(
      scenarios,
      3,
      17,
      DECISION_BENCH_V3_METHODS,
    );
    const report = createDecisionBenchmarkReportV3(
      scenarios,
      schedule.map((trial) => result(
        trial,
        undefined,
        trial.methodId === "orynt_responses_ws"
          ? 100
          : trial.methodId === "orynt_app_server"
            ? 180
            : 240,
      )),
    );
    expect(report.benchmarkId).toBe("decision-v3");
    expect(report.methods.map((method) => method.methodId)).toEqual(DECISION_BENCH_V3_METHODS);
    expect(report.winGate.passed).toBe(true);
    expect(report.winGate.speedRatio.p50).toBeCloseTo(2.4);
  });

  it("scores timeout and invalid output incorrect and applies all win gates", () => {
    const schedule = buildDecisionTrialSchedule(scenarios, 3, 17);
    const results = schedule.map((trial) => result(trial));
    results[0] = { ...results[0]!, status: "timeout", decision: null, timing: { promptAcceptedMs: 10, finishedMs: 120_010 } };
    results[1] = { ...results[1]!, status: "invalid", decision: null };
    const report = createDecisionBenchmarkReport(scenarios, results);
    expect(report.trials.slice(0, 2).map((trial) => trial.correct)).toEqual([false, false]);
    expect(report.winGate).toMatchObject({
      accuracyNonInferior: true,
      p50AtLeast2x: true,
      p95AtLeast1_5x: true,
      confidenceIntervalExcludesTie: true,
      passed: true,
    });
    expect(report.winGate.speedRatio.p50).toBeCloseTo(2.4);
  });

  it("renders parseable JSON/JSONL and an English Markdown report", () => {
    const report = createDecisionBenchmarkReport(
      scenarios,
      buildDecisionTrialSchedule(scenarios, 1).map((trial) => result(trial)),
    );
    expect(JSON.parse(renderDecisionReportJson(report))).toMatchObject({ benchmarkId: "decision-v1", scenarioCount: 32 });
    expect(renderDecisionTrialsJsonl(report.trials).trim().split("\n")).toHaveLength(64);
    expect(renderDecisionReportMarkdown(report)).toContain("# Orynt vs Hermes Decision Benchmark");
    expect(renderDecisionReportMarkdown(report)).toContain("## Win gate");
    expect(renderDecisionReportMarkdown(report)).toContain("## Orynt top bottlenecks");
    expect(renderDecisionReportMarkdown(report)).toContain("**Result: WIN**");
  });
});
