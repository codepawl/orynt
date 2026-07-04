import { describe, expect, it } from "vitest";

import type {
  CandidateRule,
  CodexContract,
  CorePolicy,
  EpisodicMemoryItem,
  RunEventType,
  RunStore,
  MemoryNamespace,
  SkillDefinition,
  VerificationResult,
} from "@codepawl/shared";
import { InMemoryRunStore, createConservativeCodingApprenticePolicy, createDefaultRunBudget } from "@codepawl/shared";

import { LocalSkillRegistry, LocalSkillReplayPlanner, SkillCandidateBuilder, SkillRegistryFailure } from "./index";

const namespace: MemoryNamespace = {
  capabilityId: "coding-apprentice",
  workspaceId: "workspace-skill",
  repositoryPath: "/repo/codepawl",
};

const provenance = {
  runId: "run-1",
  taskId: "task-skill",
  eventIds: ["run-1-event-40"],
  artifactRefs: [
    {
      id: "candidate-rule-artifact",
      kind: "candidate_rule" as const,
      uri: "codepawl-artifact://run-1/memory/rule.json",
      label: "Candidate rule",
    },
  ],
  sources: ["verification_result" as const, "run_event" as const],
  verificationResultId: "verification-result-1",
  importBundleId: "codex-result-1",
};

function acceptedRule(overrides: Partial<CandidateRule> = {}): CandidateRule {
  return {
    id: "candidate-rule-package-scope",
    namespace,
    status: "accepted",
    title: "Keep package fixes scoped",
    rule: "Keep source-only fixes under packages/** unless the contract says otherwise.",
    scope: {
      repositoryPath: "/repo/codepawl",
      allowedPaths: ["packages/**"],
      protectedPaths: [".env", "pnpm-lock.yaml"],
      commands: ["pnpm test:contracts"],
    },
    evidence: [
      {
        kind: "allowed_scope_pattern",
        summary: "Verifier passed after changed files stayed inside packages/**.",
        eventIds: ["run-1-event-40"],
        artifactRefs: provenance.artifactRefs,
        confidence: 0.86,
      },
    ],
    provenance,
    redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
    ...overrides,
  };
}

function episode(): EpisodicMemoryItem {
  return {
    id: "episode-successful-run",
    namespace,
    kind: "run_episode",
    summary: "Successful verified run with package-only changes.",
    content: { changedFiles: ["packages/shared/src/index.ts"] },
    provenance,
    retention: { ttlDays: 30 },
    redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
    confidence: 1,
    createdAt: "2026-06-26T00:00:00.000Z",
  };
}

function verification(overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    id: "verification-result-1",
    planId: "verification-plan-1",
    runId: "run-1",
    taskId: "task-skill",
    status: "pass",
    verdict: { status: "pass", reason: "All commands passed", confidence: 1 },
    evidence: [
      {
        id: "command-pass",
        kind: "command",
        label: "pnpm test:contracts",
        command: "pnpm test:contracts",
        exitCode: 0,
        stdout: "ok token=sk-commandsecret123",
        stderr: "",
      },
      {
        id: "diff-scope",
        kind: "diff_scope",
        label: "Diff scope",
        diffScope: {
          baseRef: "HEAD",
          changedFiles: ["packages/shared/src/index.ts"],
          allowedFiles: ["packages/shared/src/index.ts"],
          protectedFiles: [],
          unexpectedFiles: [],
          hasChanges: true,
          withinAllowedScope: true,
          protectedPathTouched: false,
        },
      },
    ],
    diffScope: {
      baseRef: "HEAD",
      changedFiles: ["packages/shared/src/index.ts"],
      allowedFiles: ["packages/shared/src/index.ts"],
      protectedFiles: [],
      unexpectedFiles: [],
      hasChanges: true,
      withinAllowedScope: true,
      protectedPathTouched: false,
    },
    artifacts: [
      {
        id: "verification-artifact",
        kind: "validation_report",
        uri: "codepawl-artifact://run-1/verification.json",
        label: "Verification result",
      },
    ],
    startedAt: "2026-06-26T00:00:00.000Z",
    completedAt: "2026-06-26T00:00:01.000Z",
    ...overrides,
  };
}

function codexContract(): CodexContract {
  return {
    id: "codex-contract-1",
    runId: "run-1",
    taskId: "task-skill",
    provider: {
      id: "codex-contract-generator",
      name: "Contract generator",
      kind: "contract_generator",
    },
    executionMode: "contract_only",
    goal: "Fix the package scoped test.",
    markdown: "Manual contract only.",
    metadata: {
      id: "codex-contract-1-metadata",
      runId: "run-1",
      taskId: "task-skill",
      providerId: "codex-contract-generator",
      executionMode: "contract_only",
      repository: {
        repositoryPath: "/repo/codepawl",
        gitRoot: "/repo/codepawl",
        currentBranch: "main",
        currentCommit: "abc123",
        isDirty: false,
        hasRemote: true,
        remotes: ["origin"],
      },
      sandbox: {
        id: "sandbox-1",
        runId: "run-1",
        taskId: "task-skill",
        repositoryPath: "/repo/codepawl",
        gitRoot: "/repo/codepawl",
        worktreePath: "/tmp/codepawl-worktrees/run-1",
        branchName: "codepawl/run-1",
        baseRef: "HEAD",
        currentCommit: "abc123",
        createdAt: "2026-06-26T00:00:00.000Z",
      },
      allowedPaths: ["packages/**"],
      protectedPaths: [".env", "pnpm-lock.yaml"],
      blockedCommands: ["rm -rf ."],
      validationCommands: ["pnpm test:contracts"],
      budget: {
        maxSteps: 40,
        maxWallTimeMs: 1_800_000,
        maxModelTokens: 120_000,
        stopOnBudgetExceeded: true,
      },
      redactionApplied: true,
      createdAt: "2026-06-26T00:00:00.000Z",
    },
  };
}

function activeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  const candidate = new SkillCandidateBuilder().createCandidateSkill({
    namespace,
    acceptedRules: [acceptedRule()],
    episodes: [episode()],
    verificationResult: verification(),
    codexContract: codexContract(),
    sandbox: { repositoryPath: "/repo/codepawl", worktreePath: "/tmp/codepawl-worktrees/run-1", baseRef: "HEAD" },
  });

  return {
    ...candidate.skill,
    status: "active",
    promotionDecisions: [
      {
        skillId: candidate.skill.id,
        decision: "promote",
        actor: "operator",
        reason: "Reviewed evidence and manually promoted.",
        runId: "run-1",
        decidedAt: "2026-06-26T00:00:02.000Z",
      },
    ],
    ...overrides,
  };
}

function replayPolicy(overrides: Partial<CorePolicy> = {}): CorePolicy {
  return {
    ...createConservativeCodingApprenticePolicy("/repo/codepawl", "/tmp/codepawl-worktrees"),
    ...overrides,
  };
}

function replayStore(): { store: RunStore; runId: string } {
  const store = new InMemoryRunStore();
  const run = store.createRun({
    goal: "Preview replay plan",
    capabilityId: "coding-apprentice",
    taskId: "task-skill",
    workspaceId: "workspace-skill",
    budget: createDefaultRunBudget(),
  });
  return { store, runId: run.id };
}

describe("SkillCandidateBuilder", () => {
  it("creates candidate skills from accepted rules and successful verifier evidence without auto-promotion", () => {
    const candidate = new SkillCandidateBuilder().createCandidateSkill({
      namespace,
      acceptedRules: [acceptedRule()],
      episodes: [episode()],
      verificationResult: verification(),
      codexContract: codexContract(),
      sandbox: { repositoryPath: "/repo/codepawl", worktreePath: "/tmp/codepawl-worktrees/run-1", baseRef: "HEAD" },
    });

    expect(candidate.skill.status).toBe("candidate");
    expect(candidate.skill.title).toBe("Keep package fixes scoped");
    expect(candidate.skill.validation.commands).toEqual(["pnpm test:contracts"]);
    expect(candidate.skill.safety.protectedPaths).toEqual([".env", "pnpm-lock.yaml"]);
    expect(candidate.skill.safety.blockedActions).toContain("automatic_execution");
    expect(candidate.skill.provenance).toMatchObject({
      sourceRunIds: ["run-1"],
      sourceTaskIds: ["task-skill"],
      candidateRuleIds: ["candidate-rule-package-scope"],
      episodeIds: ["episode-successful-run"],
      verificationResultIds: ["verification-result-1"],
      codexContractIds: ["codex-contract-1"],
    });
    expect(JSON.stringify(candidate)).not.toContain("sk-commandsecret123");
  });

  it("requires accepted rules and successful verification before extracting a candidate skill", () => {
    const builder = new SkillCandidateBuilder();

    expect(() =>
      builder.createCandidateSkill({
        namespace,
        acceptedRules: [acceptedRule({ status: "candidate" })],
        episodes: [episode()],
        verificationResult: verification(),
      }),
    ).toThrow("accepted candidate rule is required");

    expect(() =>
      builder.createCandidateSkill({
        namespace,
        acceptedRules: [acceptedRule()],
        episodes: [episode()],
        verificationResult: verification({ status: "fail", verdict: { status: "fail", reason: "failed", confidence: 1 } }),
      }),
    ).toThrow("successful verification is required");
  });
});

describe("LocalSkillRegistry", () => {
  it("stores candidate skills, summarizes without auto-promotion, and promotes only through explicit decisions", async () => {
    const registry = new LocalSkillRegistry();
    const extraction = new SkillCandidateBuilder().createCandidateSkill({
      namespace,
      acceptedRules: [acceptedRule()],
      episodes: [episode()],
      verificationResult: verification(),
      codexContract: codexContract(),
    });

    const created = await registry.createCandidateSkill(extraction);
    expect(created.status).toBe("candidate");
    expect(await registry.summarizeSkills(namespace)).toMatchObject({
      skillCount: 1,
      statusCounts: { candidate: 1, active: 0, rejected: 0, superseded: 0, archived: 0 },
    });

    const promoted = await registry.promoteSkillManually({
      skillId: created.id,
      decision: "promote",
      actor: "operator",
      reason: "Reviewed evidence and accepted manual promotion.",
      runId: "run-1",
      decidedAt: "2026-06-26T00:00:02.000Z",
    });

    expect(promoted.status).toBe("active");
    expect(promoted.promotionDecisions.at(-1)?.decision).toBe("promote");
  });

  it("supports reject, archive, and supersede transitions with explicit decisions", async () => {
    const registry = new LocalSkillRegistry();
    const extraction = new SkillCandidateBuilder().createCandidateSkill({
      namespace,
      acceptedRules: [acceptedRule()],
      episodes: [episode()],
      verificationResult: verification(),
    });
    const created = await registry.createCandidateSkill(extraction);

    const rejected = await registry.rejectSkill({
      skillId: created.id,
      decision: "reject",
      actor: "operator",
      reason: "Too broad for promotion.",
      decidedAt: "2026-06-26T00:00:03.000Z",
    });
    expect(rejected.status).toBe("rejected");

    const archived = await registry.updateSkillStatus({
      skillId: rejected.id,
      decision: "archive",
      actor: "operator",
      reason: "Keep history but remove from review queue.",
      decidedAt: "2026-06-26T00:00:04.000Z",
    });
    expect(archived.status).toBe("archived");

    const second = await registry.createCandidateSkill({
      ...extraction,
      skill: { ...extraction.skill, id: "skill-second", title: "Second skill" },
    });
    const superseded = await registry.updateSkillStatus({
      skillId: second.id,
      decision: "supersede",
      actor: "operator",
      reason: "Replaced by a narrower skill.",
      supersededBy: "skill-replacement",
      decidedAt: "2026-06-26T00:00:05.000Z",
    });
    expect(superseded.status).toBe("superseded");
    expect(superseded.supersededBy).toBe("skill-replacement");
  });

  it("rejects invalid manual transitions", async () => {
    const registry = new LocalSkillRegistry();
    await expect(
      registry.promoteSkillManually({
        skillId: "missing",
        decision: "promote",
        actor: "operator",
        reason: "No skill exists.",
        decidedAt: "2026-06-26T00:00:02.000Z",
      }),
    ).rejects.toBeInstanceOf(SkillRegistryFailure);
  });

  it("plans later invocation only for active skills and falls back for candidate, rejected, or archived skills", async () => {
    const registry = new LocalSkillRegistry([
      activeSkill({
        id: "skill-active-package-scope",
        title: "Keep package fixes scoped",
        status: "active",
      }),
      activeSkill({
        id: "skill-candidate-package-scope",
        title: "Candidate package scope",
        status: "candidate",
        promotionDecisions: [],
      }),
      activeSkill({
        id: "skill-rejected-package-scope",
        title: "Rejected package scope",
        status: "rejected",
      }),
      activeSkill({
        id: "skill-archived-package-scope",
        title: "Archived package scope",
        status: "archived",
      }),
    ]);

    const activeInvocation = await registry.planSkillInvocation({
      namespace,
      runId: "run-later-1",
      taskId: "task-later",
      text: "Keep package fixes scoped",
    });
    expect(activeInvocation.status).toBe("planned");
    expect(activeInvocation.skillId).toBe("skill-active-package-scope");
    expect(activeInvocation.executable).toBe(false);
    expect(activeInvocation.requiredApprovals).toContain("operator approval required before invoking an approved skill");
    expect(activeInvocation.plannedSteps.map((step) => step.skillStepId)).toEqual(["step-apply-rule-scope", "step-validate"]);

    const candidateFallback = await registry.planSkillInvocation({
      namespace,
      runId: "run-later-2",
      taskId: "task-later",
      text: "Candidate package scope",
    });
    expect(candidateFallback).toMatchObject({
      status: "fallback",
      fallbackReason: "skill_not_active",
      selectedSkillStatus: "candidate",
    });

    const rejectedFallback = await registry.planSkillInvocation({
      namespace,
      runId: "run-later-3",
      taskId: "task-later",
      text: "Rejected package scope",
    });
    expect(rejectedFallback).toMatchObject({
      status: "fallback",
      fallbackReason: "skill_rejected",
      selectedSkillStatus: "rejected",
    });

    const archivedFallback = await registry.planSkillInvocation({
      namespace,
      runId: "run-later-4",
      taskId: "task-later",
      text: "Archived package scope",
    });
    expect(archivedFallback).toMatchObject({
      status: "fallback",
      fallbackReason: "skill_archived",
      selectedSkillStatus: "archived",
    });
  });
});

describe("LocalSkillReplayPlanner", () => {
  it("creates a policy-gated dry-run replay plan for an active skill", () => {
    const { store, runId } = replayStore();
    const plan = new LocalSkillReplayPlanner({ runStore: store }).createReplayPlan({
      skill: activeSkill(),
      runId,
      taskId: "task-skill",
      mode: "active_dry_run",
      repositoryPath: "/repo/codepawl",
      baseRef: "HEAD",
      policy: replayPolicy(),
    });

    expect(plan.mode).toBe("active_dry_run");
    expect(plan.dryRunOnly).toBe(true);
    expect(plan.executable).toBe(false);
    expect(plan.readiness).toBe("ready");
    expect(plan.preconditions.every((item) => item.status === "passed")).toBe(true);
    expect(plan.validationExpectations.map((item) => item.command)).toEqual(["pnpm test:contracts"]);
    expect(plan.blockedActions).toEqual(["automatic_execution", "codex_auto_run", "browser_automation", "secret_storage"]);
    expect(plan.requiredApprovals).toContain("manual approval required before any future skill execution");
    expect(plan.expectedArtifacts.map((artifact) => artifact.kind)).toContain("skill_replay_plan");
    expect(JSON.stringify(plan)).not.toContain("sk-commandsecret123");
    expect(store.listEvents(runId).map((event) => event.type)).toEqual([
      "skill_replay_plan_requested",
      "skill_replay_preconditions_checked",
      "skill_replay_policy_checked",
      "skill_replay_budget_estimated",
      "skill_replay_plan_created",
    ] satisfies RunEventType[]);
  });

  it("allows candidate skills only as non-executable dry-run previews", () => {
    const skill = activeSkill({ status: "candidate", promotionDecisions: [] });
    const plan = new LocalSkillReplayPlanner().createReplayPlan({
      skill,
      runId: "run-1",
      taskId: "task-skill",
      mode: "candidate_preview",
      repositoryPath: "/repo/codepawl",
      baseRef: "HEAD",
      policy: replayPolicy(),
    });

    expect(plan.readiness).toBe("preview_only");
    expect(plan.executable).toBe(false);
    expect(plan.stopReasons).toContain("candidate_preview_only");
    expect(plan.summary).toContain("dry-run preview only");
  });

  it("blocks rejected skills from replay planning", () => {
    const plan = new LocalSkillReplayPlanner().createReplayPlan({
      skill: activeSkill({ status: "rejected" }),
      runId: "run-1",
      taskId: "task-skill",
      mode: "active_dry_run",
      repositoryPath: "/repo/codepawl",
      baseRef: "HEAD",
      policy: replayPolicy(),
    });

    expect(plan.readiness).toBe("blocked");
    expect(plan.stopReasons).toContain("skill_not_active");
    expect(new LocalSkillReplayPlanner().explainBlockedReplay(plan)).toContain("not active");
  });

  it("blocks missing required preconditions", () => {
    const plan = new LocalSkillReplayPlanner().createReplayPlan({
      skill: activeSkill({ preconditions: [{ id: "missing", kind: "repository_scope", summary: "MISSING repository scope", required: true }] }),
      runId: "run-1",
      taskId: "task-skill",
      mode: "active_dry_run",
      repositoryPath: "/repo/codepawl",
      baseRef: "HEAD",
      policy: replayPolicy(),
    });

    expect(plan.readiness).toBe("blocked");
    expect(plan.preconditions[0]).toMatchObject({ id: "missing", status: "failed" });
    expect(plan.stopReasons).toContain("missing_precondition");
  });

  it("blocks policy violations in replay validation expectations", () => {
    const plan = new LocalSkillReplayPlanner().createReplayPlan({
      skill: activeSkill({
        validation: {
          requiresVerifierPass: true,
          requiresDiffWithinScope: true,
          commands: ["rm -rf ."],
          expectedEvidenceKinds: ["command"],
        },
        safety: {
          ...activeSkill().safety,
          allowedCommands: ["rm -rf ."],
        },
      }),
      runId: "run-1",
      taskId: "task-skill",
      mode: "active_dry_run",
      repositoryPath: "/repo/codepawl",
      baseRef: "HEAD",
      policy: replayPolicy(),
    });

    expect(plan.readiness).toBe("blocked");
    expect(plan.policyChecks[0]?.decision).toBe("block");
    expect(plan.stopReasons).toContain("policy_blocked");
  });

  it("warns or blocks when replay budget estimates exceed policy budget", () => {
    const policy = replayPolicy({
      sandbox: {
        ...replayPolicy().sandbox,
        budget: { ...replayPolicy().sandbox.budget, maxSteps: 1, maxModelTokens: 10 },
      },
    });
    const plan = new LocalSkillReplayPlanner().createReplayPlan({
      skill: activeSkill(),
      runId: "run-1",
      taskId: "task-skill",
      mode: "active_dry_run",
      repositoryPath: "/repo/codepawl",
      baseRef: "HEAD",
      policy,
    });

    expect(plan.budgetEstimate.decision).toBe("stop");
    expect(plan.stopReasons).toContain("budget_exceeded");
  });

  it("redacts sensitive replay plan display values", () => {
    const plan = new LocalSkillReplayPlanner().createReplayPlan({
      skill: activeSkill({
        summary: "Use token=sk-replaysecret123 during replay",
        steps: [
          {
            id: "step-secret",
            title: "Handle secret",
            instruction: "Do not reveal apiKey=sk-replaysecret123",
            expectedOutcome: "Secret remains hidden",
          },
        ],
      }),
      runId: "run-1",
      taskId: "task-skill",
      mode: "active_dry_run",
      repositoryPath: "/repo/codepawl",
      baseRef: "HEAD",
      policy: replayPolicy(),
    });

    expect(plan.redaction.applied).toBe(true);
    expect(JSON.stringify(plan)).not.toContain("sk-replaysecret123");
    expect(JSON.stringify(plan)).toContain("[REDACTED]");
  });
});
