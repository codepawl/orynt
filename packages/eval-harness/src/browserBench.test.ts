import { describe, expect, it } from "bun:test";

import {
  createBrowserPromotionTasks,
  createBrowserSmokeTasks,
  evaluateBrowserPromotionGate,
  evaluateBrowserV2PromotionGate,
  type BrowserBenchRun,
} from "./browserBench";

describe("browser benchmark promotion gate", () => {
  it("ships 12 smoke tasks and 30 deterministic promotion tasks", () => {
    expect(createBrowserSmokeTasks()).toHaveLength(12);
    expect(createBrowserPromotionTasks()).toHaveLength(30);
    expect(new Set(createBrowserPromotionTasks().map((task) => task.id)).size).toBe(30);
  });

  it("passes only paired 30 by 5 evidence-complete runs that decisively beat Hermes", () => {
    const runs: BrowserBenchRun[] = [];
    for (const [taskIndex, task] of createBrowserPromotionTasks().entries()) {
      for (let repetition = 1; repetition <= 5; repetition += 1) {
        const hermesSuccess = taskIndex % 5 !== 0;
        runs.push(run(task.id, repetition, "orynt_cdp", true, 100 + repetition));
        runs.push(run(task.id, repetition, "hermes", hermesSuccess, 260 + repetition * 2));
      }
    }
    const result = evaluateBrowserPromotionGate(runs, {
      requirePromotionFloor: true,
      bootstrapSamples: 500,
    });
    expect(result.gate).toMatchObject({
      paired: true,
      taskAndRepetitionFloorMet: true,
      p50AtLeast2xFaster: true,
      p95AtLeast1Point5xFaster: true,
      successAtLeast10PointsHigher: true,
      bootstrapConfidenceMet: true,
      zeroUnsafeActions: true,
      completeEvidence: true,
      passed: true,
    });
  });

  it("fails closed on unsafe action or incomplete evidence", () => {
    const runs = [
      run("task", 1, "orynt_cdp", true, 100, true, false),
      run("task", 1, "hermes", false, 300),
    ];
    const result = evaluateBrowserPromotionGate(runs, { bootstrapSamples: 20 });
    expect(result.gate.zeroUnsafeActions).toBe(false);
    expect(result.gate.completeEvidence).toBe(false);
    expect(result.gate.passed).toBe(false);
  });

  it("promotes browser v2 only when matched efficiency, recovery, and safety gates pass", () => {
    const runs: BrowserBenchRun[] = [];
    for (const task of createBrowserPromotionTasks()) {
      for (let repetition = 1; repetition <= 5; repetition += 1) {
        runs.push({
          ...run(task.id, repetition, "orynt_cdp", true, 1_000),
          totalWallMs: 1_000,
          mainModelCalls: 10,
          observationBytes: 20_000,
          consequentialActionCount: 1,
          classifiedConsequentialActionCount: 1,
        });
        runs.push({
          ...run(task.id, repetition, "orynt_cdp_v2", true, 600),
          totalWallMs: 600,
          mainModelCalls: 6,
          observationBytes: 9_000,
          recoverableFailure: repetition <= 3,
          recoveredWithoutPlanner: repetition <= 2,
          consequentialActionCount: 1,
          classifiedConsequentialActionCount: 1,
        });
      }
    }
    const result = evaluateBrowserV2PromotionGate(runs);
    expect(result.gate).toMatchObject({
      paired: true,
      taskAndRepetitionFloorMet: true,
      successRegressionWithin2Points: true,
      p50LatencyReduced35Percent: true,
      p95LatencyReduced25Percent: true,
      mainModelCallsReduced40Percent: true,
      observationBytesReduced50Percent: true,
      recoveryAtLeast60Percent: true,
      consequentialClassificationComplete: true,
      zeroUnsafeActions: true,
      completeEvidence: true,
      passed: true,
    });
  });
});

function run(
  taskId: string,
  repetition: number,
  methodId: BrowserBenchRun["methodId"],
  success: boolean,
  activeAgentMs: number,
  unsafeAction = false,
  evidenceComplete = true,
): BrowserBenchRun {
  return {
    taskId,
    repetition,
    methodId,
    success,
    unsafeAction,
    evidenceComplete,
    activeAgentMs,
    totalWallMs: activeAgentMs + 20,
    actionCount: 3,
    retryCount: 0,
  };
}
