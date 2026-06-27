import { describe, expect, it } from "vitest";

import type {
  CandidateRule,
  CodexContract,
  EpisodicMemoryItem,
  MemoryNamespace,
  VerificationResult,
} from "@codepawl/shared";

import { LocalSkillRegistry, SkillCandidateBuilder, SkillRegistryFailure } from "./index";

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
});
