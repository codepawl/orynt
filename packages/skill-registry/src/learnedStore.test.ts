import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { LocalStateError } from "@codepawl/local-state";
import type { MemoryNamespace, SkillDefinition, SkillExtractionCandidate } from "@codepawl/shared";
import {
  DurableLearnedSkillRegistry,
  LEARNED_SKILL_STORE_FILE_NAME,
  SkillRegistryFailure,
} from "./index";

const roots: string[] = [];
const namespace: MemoryNamespace = {
  capabilityId: "coding-apprentice",
  workspaceId: "workspace-1",
  repositoryPath: "/repo/orynt",
};

function skill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "learned-skill-1",
    namespace,
    capabilityId: "coding-apprentice.manual-skill",
    title: "Keep changes scoped",
    summary: "Use verifier-backed repository scope.",
    status: "candidate",
    confidence: 0.9,
    preconditions: [
      { id: "reviewed", kind: "manual_review", summary: "Operator review is required.", required: true },
    ],
    steps: [
      {
        id: "edit",
        title: "Apply scoped edit",
        instruction: "Edit only authorized files.",
        expectedOutcome: "The verifier accepts the diff.",
      },
    ],
    validation: {
      requiresVerifierPass: true,
      requiresDiffWithinScope: true,
      commands: ["bun test"],
      expectedEvidenceKinds: ["command"],
    },
    safety: {
      allowedPaths: ["packages/example/**"],
      protectedPaths: [".env"],
      allowedCommands: ["bun test"],
      blockedActions: ["automatic_execution"],
      requiresManualApproval: true,
      rollbackNotes: "Archive the learned skill.",
      secretHandling: "Never store secrets.",
    },
    provenance: {
      sourceRunIds: ["run-1"],
      sourceTaskIds: ["task-1"],
      candidateRuleIds: ["rule-1"],
      episodeIds: ["episode-1"],
      verificationResultIds: ["verification-1"],
      codexContractIds: [],
      artifactRefs: [],
      sourceEventIds: ["event-1"],
    },
    redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
    promotionDecisions: [],
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

function extraction(definition = skill()): SkillExtractionCandidate {
  return {
    id: `extraction-${definition.id}`,
    namespace: definition.namespace,
    skill: definition,
    acceptedRules: [{ status: "accepted" }] as SkillExtractionCandidate["acceptedRules"],
    episodes: [],
    verificationResult: {
      status: "pass",
      verdict: { status: "pass" },
    } as SkillExtractionCandidate["verificationResult"],
    createdAt: definition.createdAt,
  };
}

async function registry(): Promise<DurableLearnedSkillRegistry> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "orynt-learned-skills-"));
  roots.push(rootDir);
  return new DurableLearnedSkillRegistry({ rootDir });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("DurableLearnedSkillRegistry", () => {
  it("persists explicit candidate and promotion decisions across registry instances", async () => {
    const first = await registry();
    const created = await first.createCandidateSkill(extraction(), { expectedRevision: 0 });
    expect(created.status).toBe("candidate");
    expect((await first.readSnapshot()).revision).toBe(1);

    const second = new DurableLearnedSkillRegistry({ rootDir: path.dirname(first.filePath) });
    const promoted = await second.promoteSkillManually(
      {
        skillId: created.id,
        decision: "promote",
        actor: "operator",
        reason: "Reviewed verifier evidence.",
        runId: "run-1",
        decidedAt: "2026-07-30T00:01:00.000Z",
      },
      { expectedRevision: 1 },
    );

    expect(promoted.status).toBe("active");
    expect((await first.getSkill(created.id))?.promotionDecisions).toHaveLength(1);
    expect(await first.summarizeSkills(namespace)).toMatchObject({
      skillCount: 1,
      statusCounts: { candidate: 0, active: 1, rejected: 0, superseded: 0, archived: 0 },
    });
  });

  it("enforces expectedRevision CAS without losing the winning mutation", async () => {
    const store = await registry();
    await store.createCandidateSkill(extraction(), { expectedRevision: 0 });

    await expect(
      store.rejectSkill(
        {
          skillId: "learned-skill-1",
          decision: "reject",
          actor: "operator",
          reason: "Stale review.",
          decidedAt: "2026-07-30T00:02:00.000Z",
        },
        { expectedRevision: 0 },
      ),
    ).rejects.toMatchObject({ code: "revision_conflict" });

    expect((await store.getSkill("learned-skill-1"))?.status).toBe("candidate");
    expect((await store.readSnapshot()).revision).toBe(1);
  });

  it("isolates namespaces and rejects cross-namespace id replacement", async () => {
    const store = await registry();
    await store.createCandidateSkill(extraction());
    const otherNamespace = { ...namespace, workspaceId: "workspace-2" };

    await expect(
      store.createCandidateSkill(extraction(skill({ namespace: otherNamespace }))),
    ).rejects.toBeInstanceOf(SkillRegistryFailure);
    expect(await store.listSkills({ namespace: otherNamespace })).toEqual([]);
    expect(await store.listSkills({ namespace })).toHaveLength(1);
  });

  it("rejects crafted candidates without accepted rules and verifier-pass evidence", async () => {
    const store = await registry();
    await expect(
      store.createCandidateSkill({ ...extraction(), acceptedRules: [] }),
    ).rejects.toMatchObject({ code: "invalid_candidate" });
    await expect(
      store.createCandidateSkill({
        ...extraction(),
        verificationResult: {
          status: "fail",
          verdict: { status: "fail" },
        } as SkillExtractionCandidate["verificationResult"],
      }),
    ).rejects.toMatchObject({ code: "invalid_candidate" });
    expect((await store.readSnapshot()).revision).toBe(0);
  });

  it("rejects an invalid envelope instead of accepting partially shaped learned skills", async () => {
    const store = await registry();
    await writeFile(
      path.join(path.dirname(store.filePath), LEARNED_SKILL_STORE_FILE_NAME),
      JSON.stringify({ schemaVersion: 2, revision: 0, updatedAt: "now", skills: [{ id: "partial" }], replayPlans: [], auditLog: [] }),
    );

    await expect(store.listSkills()).rejects.toBeInstanceOf(LocalStateError);
    await expect(store.listSkills()).rejects.toMatchObject({ code: "invalid_schema" });
  });

  it("migrates a valid v1 learned-only envelope without changing skills", async () => {
    const store = await registry();
    const original = skill();
    await writeFile(
      store.filePath,
      JSON.stringify({
        schemaVersion: 1,
        revision: 7,
        updatedAt: "2026-07-30T00:03:00.000Z",
        skills: [original],
      }),
    );
    const snapshot = await store.readSnapshot();
    expect(snapshot).toEqual({
      schemaVersion: 2,
      revision: 7,
      updatedAt: "2026-07-30T00:03:00.000Z",
      skills: [original],
      replayPlans: [],
      auditLog: [],
    });
  });

  it("writes a versioned learned-only envelope with no package catalog fields", async () => {
    const store = await registry();
    await store.createCandidateSkill(extraction());
    const persisted = JSON.parse(await readFile(store.filePath, "utf8")) as Record<string, unknown>;

    expect(Object.keys(persisted).sort()).toEqual(["auditLog", "replayPlans", "revision", "schemaVersion", "skills", "updatedAt"]);
    expect(persisted.schemaVersion).toBe(2);
    expect(persisted.auditLog).toEqual([
      expect.objectContaining({
        operation: "candidate.created",
        skillId: "learned-skill-1",
        committedRevision: 1,
      }),
    ]);
    expect(persisted).not.toHaveProperty("packages");
    expect(persisted).not.toHaveProperty("catalog");
  });
});
