import { describe, expect, it } from "bun:test";

import {
  auditRealProjectBattleTrial,
  createRealProjectBattleCampaign,
  evaluateCalculatorPragmaticGate,
  evaluateAuthoredSourceReadability,
  evaluateProjectBoardCanaryGate,
  evaluateProductUiVisualReview,
  pathIsAllowed,
  repetitionsForBattleLane,
  type RealProjectBattleTrial,
} from "./realProjectBattle";

function passingTrial(): RealProjectBattleTrial {
  return {
    schemaVersion: 5,
    id: "project-board-orynt_clean-r1",
    taskId: "project-board",
    lane: "orynt_clean",
    repetition: 1,
    seedCommit: "seed",
    sourceDigest: "source",
    cliSha256: "cli",
    buildManifestSha256: "build",
    oracleSha256: "oracle",
    modelBinding: { model: "gpt-5.6-luna", reasoningEffort: "medium" },
    actualModelBinding: {
      model: "gpt-5.6-luna",
      reasoningEffort: "medium",
    },
    performance: {
      durationMs: 45_000,
      inputTokens: 120_000,
      cachedInputTokens: 90_000,
      outputTokens: 8_000,
      reasoningOutputTokens: 1_000,
      invocationCount: 3,
      implementationInvocationCount: 1,
      recoveryInvocationCount: 0,
      reviewerInvocationCount: 0,
    },
    executionDiagnostics: {
      absolutePathRejectionCount: 0,
      reconnectCount: 0,
    },
    startedAt: "2026-08-06T00:00:00.000Z",
    completedAt: "2026-08-06T00:01:00.000Z",
    totalWallMs: 60_000,
    verdict: "pass",
    processExitCode: 0,
    timedOut: false,
    agentChangedPaths: ["src/app.js"],
    runtimeManagedPaths: [{
      path: ".codex/orynt-beta-verify.mjs",
      sha256: "a".repeat(64),
    }],
    unexpectedPaths: [],
    protectedPathMutations: [],
    oracleResults: [{
      oracleId: "project-board-browser-v1",
      exitCode: 0,
      stdoutPath: "oracle/stdout.log",
      stderrPath: "oracle/stderr.log",
    }],
    runtimeArtifacts: ["runtime/artifact-manifest.json"],
    runtimeEvidenceValid: true,
    visualEvidence: ["visual/desktop.png", "visual/mobile.png"],
    visualVerdict: "pass",
    visualNote: null,
    visualReview: {
      binding: { model: "gpt-5.6-luna", reasoningEffort: "low" },
      durationMs: 10_000,
      inputTokens: 2_000,
      cachedInputTokens: 0,
      outputTokens: 500,
      reasoningOutputTokens: 100,
      review: {
        schemaVersion: 1,
        scores: [
          ["UIQ-1", 4],
          ["UIQ-2", 4],
          ["UIQ-3", 4],
          ["UIQ-4", 4],
          ["UIQ-5", 4],
          ["UIQ-6", 4],
        ].map(([criterionId, score]) => ({
          criterionId,
          score,
          evidence: "Visible screenshot evidence.",
        })) as NonNullable<RealProjectBattleTrial["visualReview"]>["review"]["scores"],
        findings: [],
        summary: "A coherent product interface.",
      },
      failure: null,
    },
    failureClassification: null,
    processFailure: null,
    providerTransport: "codex-cli",
  };
}

function passingCalculatorTrials(): RealProjectBattleTrial[] {
  return [
    ["orynt_clean", 1, 240_000, 220_000],
    ["orynt_clean", 2, 300_000, 280_000],
    ["orynt_soak", 1, 330_000, 300_000],
  ].map(([lane, repetition, totalWallMs, inputTokens]) => {
    const trial = passingTrial();
    trial.id = `calculator-control-${lane}-r${repetition}`;
    trial.taskId = "calculator-control";
    trial.lane = lane as RealProjectBattleTrial["lane"];
    trial.repetition = repetition as number;
    trial.totalWallMs = totalWallMs as number;
    trial.performance!.durationMs = totalWallMs as number;
    trial.performance!.inputTokens = inputTokens as number;
    trial.oracleResults[0]!.oracleId = "calculator-browser-v1";
    return trial;
  });
}

describe("real project battle contract", () => {
  it("pins the approved tasks, lanes, model, repetitions, and Click source", () => {
    const campaign = createRealProjectBattleCampaign();
    expect(campaign.implementer).toEqual({ model: "gpt-5.6-luna", reasoningEffort: "medium" });
    expect(campaign.providerTransport).toBe("codex-cli");
    expect(campaign.lanes).toEqual(["orynt_clean", "orynt_soak", "raw_codex"]);
    expect(campaign.tasks.map(({ id }) => id)).toEqual([
      "calculator-control",
      "project-board",
      "support-desk",
      "click-equality-regression",
    ]);
    expect(campaign.tasks.slice(1).every(({ repetitions }) => repetitions === 3)).toBeTrue();
    const calculator = campaign.tasks[0]!;
    expect(repetitionsForBattleLane(calculator, "orynt_clean")).toBe(2);
    expect(repetitionsForBattleLane(calculator, "orynt_soak")).toBe(2);
    expect(repetitionsForBattleLane(calculator, "raw_codex")).toBe(1);
    expect(campaign.tasks.at(-1)?.source).toMatchObject({
      baseCommit: "04ef3a6f473deb2499721a8d11f92a7d2c0912f2",
      oracleCommit: "d340b0c",
    });
  });

  it("uses path boundaries instead of prefix matching", () => {
    expect(pathIsAllowed("src/app.js", ["src"])).toBeTrue();
    expect(pathIsAllowed("src-escape/app.js", ["src"])).toBeFalse();
    expect(() => pathIsAllowed("../outside", ["src"])).toThrow("escapes repository");
  });

  it("publishes the Project Board selector cardinality checked by its oracle", () => {
    const task = createRealProjectBattleCampaign().tasks.find(
      ({ id }) => id === "project-board",
    );

    expect(task?.prompt).toContain(
      "Use exactly one page-level board-root, add-task, column-backlog, column-in-progress, and column-done element.",
    );
    expect(task?.prompt).toContain(
      "task-card may repeat, but every task card must contain exactly one edit-task and delete-task control",
    );
    expect(task?.prompt).toContain(
      "every task card that can advance must contain exactly one move-next control",
    );
  });

  it("fails closed on digest drift, protected mutation, missing oracle, and false pass", () => {
    const trial = passingTrial();
    trial.sourceDigest = "drift";
    trial.protectedPathMutations = [".env"];
    trial.oracleResults = [];
    const audit = auditRealProjectBattleTrial(
      createRealProjectBattleCampaign(),
      trial,
      { sourceDigest: "source", cliSha256: "cli" },
    );
    expect(audit.valid).toBeFalse();
    expect(audit.fatal).toEqual(expect.arrayContaining([
      "source digest mismatch",
      "protected path mutation",
      "missing external oracle result",
      "pass verdict contradicts evidence",
    ]));
  });

  it("keeps visual review pending as a visible non-success warning", () => {
    const trial = passingTrial();
    trial.visualEvidence = [];
    const audit = auditRealProjectBattleTrial(
      createRealProjectBattleCampaign(),
      trial,
      { sourceDigest: "source", cliSha256: "cli" },
    );
    trial.visualEvidence = ["visual/desktop.png", "visual/mobile.png"];
    trial.visualVerdict = "pending";
    const pendingAudit = auditRealProjectBattleTrial(
      createRealProjectBattleCampaign(),
      trial,
      { sourceDigest: "source", cliSha256: "cli", oracleSha256: "oracle" },
    );
    expect(pendingAudit.valid).toBeTrue();
    expect(pendingAudit.complete).toBeFalse();
    expect(pendingAudit.warnings).toContain("model visual verdict is pending");
  });

  it("derives the visual verdict from complete criterion scores", () => {
    const review = passingTrial().visualReview!.review!;
    expect(evaluateProductUiVisualReview(review)).toMatchObject({
      verdict: "pass",
      average: 4,
      reasons: [],
    });
    review.scores.find(({ criterionId }) => criterionId === "UIQ-6")!.score = 3;
    expect(evaluateProductUiVisualReview(review)).toMatchObject({
      verdict: "fail",
      reasons: expect.arrayContaining([
        "UIQ-6 is below the product-quality threshold",
      ]),
    });
  });

  it("advances Project Board from one complete efficient canary", () => {
    expect(evaluateProjectBoardCanaryGate([passingTrial()])).toMatchObject({
      status: "pass",
      requiredTrialId: "project-board-orynt_clean-r1",
      metrics: {
        oryntDurationMs: 45_000,
        totalWallMs: 60_000,
        totalInputTokens: 122_000,
        absolutePathRejectionCount: 0,
      },
    });
  });

  it("keeps the Project Board advancement gate incomplete or failed", () => {
    expect(evaluateProjectBoardCanaryGate([]).status).toBe("incomplete");
    const trial = passingTrial();
    trial.executionDiagnostics!.absolutePathRejectionCount = 1;
    trial.executionDiagnostics!.reconnectCount = 1;
    expect(evaluateProjectBoardCanaryGate([trial])).toMatchObject({
      status: "fail",
      reasons: expect.arrayContaining([
        "absolute-path patch rejection recurred",
      ]),
      warnings: ["provider reconnect occurred"],
    });
  });

  it("rejects manually minified authored source without targeting generated output", () => {
    expect(
      evaluateAuthoredSourceReadability(
        "styles.css",
        `.board{color:purple}${"x".repeat(1_100)}`,
      ),
    ).toEqual(expect.arrayContaining([
      expect.stringContaining("appears manually minified"),
      expect.stringContaining("longer than 400 characters"),
    ]));
    expect(
      evaluateAuthoredSourceReadability(
        "styles.css",
        ".board {\n  color: #334155;\n}\n",
      ),
    ).toEqual([]);
  });

  it("separates runtime-owned paths from agent scope and rejects opaque entries", () => {
    const trial = passingTrial();
    trial.runtimeManagedPaths = [{
      path: ".codex/untracked-helper.mjs",
      sha256: "a".repeat(64),
    }];
    const audit = auditRealProjectBattleTrial(
      createRealProjectBattleCampaign(),
      trial,
      { sourceDigest: "source", cliSha256: "cli", oracleSha256: "oracle" },
    );
    expect(audit.fatal).toContain("invalid runtime-managed path evidence");
  });

  it("rejects declared model parity when the actual implementer drifts", () => {
    const trial = passingTrial();
    trial.actualModelBinding = {
      model: "gpt-5.5",
      reasoningEffort: "high",
    };
    const audit = auditRealProjectBattleTrial(
      createRealProjectBattleCampaign(),
      trial,
      { sourceDigest: "source", cliSha256: "cli" },
    );
    expect(audit.fatal).toContain(
      "actual implementer model binding mismatch",
    );
  });

  it("passes the pragmatic Calculator gate only for three efficient required trials", () => {
    const trials = passingCalculatorTrials();
    expect(evaluateCalculatorPragmaticGate(trials)).toMatchObject({
      status: "pass",
      metrics: {
        cleanMedianWallMs: 270_000,
        cleanMedianInputTokens: 250_000,
        cleanMaxWallMs: 300_000,
        soakWallMs: 330_000,
      },
    });

    trials[1]!.performance!.reviewerInvocationCount = 1;
    expect(evaluateCalculatorPragmaticGate(trials)).toMatchObject({
      status: "fail",
      reasons: expect.arrayContaining([
        "calculator-control-orynt_clean-r2: model invocation budget exceeded",
      ]),
    });
  });

  it("budgets Calculator spend on fresh prompt tokens, not the cached whole prompt", () => {
    const trials = passingCalculatorTrials();
    for (const trial of trials) {
      // A prompt far past the whole-prompt median budget, almost entirely
      // served from the provider cache. Budgeting on `inputTokens` would fail
      // this run even though it costs less than the uncached one above.
      trial.performance!.inputTokens = 340_000;
      trial.performance!.cachedInputTokens = 320_000;
    }

    const gate = evaluateCalculatorPragmaticGate(trials);

    expect(gate.status).toBe("pass");
    expect(gate.metrics.cleanMedianFreshInputTokens).toBe(20_000);
    expect(gate.metrics.cleanMedianInputTokens).toBe(340_000);
    expect(gate.metrics.cleanMedianCacheHitRatio).toBeCloseTo(0.941, 3);
  });

  it("fails the Calculator gate when fresh prompt tokens exceed the budget", () => {
    const trials = passingCalculatorTrials();
    for (const trial of trials) {
      trial.performance!.inputTokens = 320_000;
      trial.performance!.cachedInputTokens = 0;
    }

    expect(evaluateCalculatorPragmaticGate(trials)).toMatchObject({
      status: "fail",
      reasons: expect.arrayContaining([
        "clean median fresh input exceeds 300000 tokens",
      ]),
    });
  });

  it("retains the whole-prompt per-trial ceiling as a secondary guard", () => {
    const trials = passingCalculatorTrials();
    for (const trial of trials) {
      // Fresh tokens stay well inside budget, but the whole prompt is past the
      // context ceiling the gate has always enforced.
      trial.performance!.inputTokens = 400_000;
      trial.performance!.cachedInputTokens = 399_000;
    }

    expect(evaluateCalculatorPragmaticGate(trials)).toMatchObject({
      status: "fail",
      reasons: expect.arrayContaining([
        "a clean trial exceeds the pragmatic per-trial limit",
      ]),
    });
  });

  it("budgets Project Board spend on fresh tokens across run and visual review", () => {
    const trial = passingTrial();
    trial.performance!.inputTokens = 300_000;
    trial.performance!.cachedInputTokens = 290_000;
    trial.visualReview!.inputTokens = 40_000;
    trial.visualReview!.cachedInputTokens = 30_000;

    const gate = evaluateProjectBoardCanaryGate([trial]);

    expect(gate.status).toBe("pass");
    expect(gate.metrics.totalFreshInputTokens).toBe(20_000);
    expect(gate.metrics.totalInputTokens).toBe(340_000);
    expect(gate.metrics.cacheHitRatio).toBeCloseTo(0.941, 3);
  });

  it("counts a visual review without a cache breakdown as entirely fresh", () => {
    const trial = passingTrial();
    trial.performance!.inputTokens = 100_000;
    trial.performance!.cachedInputTokens = 100_000;
    trial.visualReview!.inputTokens = 5_000;
    trial.visualReview!.cachedInputTokens = null;

    // Assuming cache reuse we did not observe would understate spend.
    expect(
      evaluateProjectBoardCanaryGate([trial]).metrics.totalFreshInputTokens,
    ).toBe(5_000);
  });

  it("keeps the pragmatic Calculator gate incomplete until all required trials exist", () => {
    expect(
      evaluateCalculatorPragmaticGate(passingCalculatorTrials().slice(0, 2)),
    ).toMatchObject({
      status: "incomplete",
      reasons: [
        "missing required trials: calculator-control-orynt_soak-r1",
      ],
    });
  });
});
