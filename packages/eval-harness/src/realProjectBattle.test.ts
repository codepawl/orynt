import { describe, expect, it } from "bun:test";

import {
  auditRealProjectBattleTrial,
  createRealProjectBattleCampaign,
  pathIsAllowed,
  type RealProjectBattleTrial,
} from "./realProjectBattle";

function passingTrial(): RealProjectBattleTrial {
  return {
    schemaVersion: 1,
    id: "project-board-orynt_clean-r1",
    taskId: "project-board",
    lane: "orynt_clean",
    repetition: 1,
    sourceDigest: "source",
    cliSha256: "cli",
    startedAt: "2026-08-06T00:00:00.000Z",
    completedAt: "2026-08-06T00:01:00.000Z",
    verdict: "pass",
    processExitCode: 0,
    timedOut: false,
    changedPaths: ["src/app.js"],
    unexpectedPaths: [],
    protectedPathMutations: [],
    oracleResults: [{ command: ["bun", "test"], exitCode: 0, stdoutPath: "oracle/stdout.log", stderrPath: "oracle/stderr.log" }],
    runtimeArtifacts: ["runtime/artifact-manifest.json"],
    visualEvidence: ["visual/desktop.png"],
    failureClassification: null,
  };
}

describe("real project battle contract", () => {
  it("pins the approved tasks, lanes, model, repetitions, and Click source", () => {
    const campaign = createRealProjectBattleCampaign();
    expect(campaign.implementer).toEqual({ model: "gpt-5.6-luna", reasoningEffort: "medium" });
    expect(campaign.lanes).toEqual(["orynt_clean", "orynt_soak", "raw_codex"]);
    expect(campaign.tasks.map(({ id }) => id)).toEqual([
      "calculator-control",
      "project-board",
      "support-desk",
      "click-equality-regression",
    ]);
    expect(campaign.tasks.slice(1).every(({ repetitions }) => repetitions === 3)).toBeTrue();
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
    expect(audit.valid).toBeTrue();
    expect(audit.warnings).toContain("visual review evidence is pending");
  });
});
