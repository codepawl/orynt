import path from "node:path";

import {
  compareAndSwapVersionedJson,
  loadVersionedJson,
} from "@codepawl/local-state";
import {
  IMPROVEMENT_STORE_SCHEMA_VERSION,
  type ActiveImprovementV2,
  type CapabilityOutcomeV1,
  type ImprovementCandidateV1,
  type ImprovementPromotionDecisionV1,
  type ImprovementStoreEnvelopeV2,
} from "@codepawl/shared";

export type CapabilityLedgerSnapshotV1 = ImprovementStoreEnvelopeV2;

const SAFE_ARTIFACT_REF = /^(?:orynt-artifact:\/\/|artifact:)[^?\s]{1,500}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStore(value: unknown): value is ImprovementStoreEnvelopeV2 {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === IMPROVEMENT_STORE_SCHEMA_VERSION &&
    Number.isInteger(value.revision) &&
    Number(value.revision) >= 0 &&
    Array.isArray(value.outcomes) &&
    Array.isArray(value.candidates) &&
    isRecord(value.activeTargets) &&
    Array.isArray(value.audit) &&
    typeof value.updatedAt === "string"
  );
}

function assertSafeOutcome(outcome: CapabilityOutcomeV1): void {
  if (
    outcome.schemaVersion !== 1 ||
    !outcome.id.trim() ||
    !outcome.runId.trim() ||
    !outcome.taskId.trim() ||
    !outcome.capabilityId.trim() ||
    !outcome.capabilityDigest.trim() ||
    !Number.isFinite(outcome.latencyMs) ||
    outcome.latencyMs < 0 ||
    !Number.isInteger(outcome.unsafeActionCount) ||
    outcome.unsafeActionCount < 0 ||
    outcome.artifactRefs.some((reference) => !SAFE_ARTIFACT_REF.test(reference))
  ) {
    throw new Error(
      "Capability outcome is invalid or contains an unsafe artifact reference.",
    );
  }
}

function assertSafeCandidate(candidate: ImprovementCandidateV1): void {
  if (
    candidate.schemaVersion !== 1 ||
    !candidate.id.trim() ||
    !candidate.targetId.trim() ||
    !candidate.baseDigest.trim() ||
    !candidate.proposedDigest.trim() ||
    !SAFE_ARTIFACT_REF.test(candidate.patchArtifactRef)
  ) {
    throw new Error(
      "Improvement candidate is invalid or contains an unsafe artifact reference.",
    );
  }
}

function targetKey(candidate: Pick<
  ImprovementCandidateV1,
  "targetClass" | "targetId" | "targetScope"
>): string {
  return `${candidate.targetScope}:${candidate.targetClass}:${candidate.targetId}`;
}

export class LocalCapabilityLedger {
  readonly filePath: string;

  constructor(root: string, fileName = "improvements/store-v2.json") {
    if (!path.isAbsolute(root)) {
      throw new Error("Capability ledger root must be absolute.");
    }
    if (
      fileName.split(/[\\/]/u).some(
        (segment) => !/^[a-zA-Z0-9._-]{1,120}$/.test(segment),
      )
    ) {
      throw new Error("Capability ledger file name is invalid.");
    }
    this.filePath = path.join(root, fileName);
  }

  private options() {
    return {
      filePath: this.filePath,
      schemaVersion: IMPROVEMENT_STORE_SCHEMA_VERSION,
      validate: isStore,
      initialize: (): ImprovementStoreEnvelopeV2 => ({
        schemaVersion: IMPROVEMENT_STORE_SCHEMA_VERSION,
        revision: 0,
        outcomes: [],
        candidates: [],
        activeTargets: {},
        audit: [],
        updatedAt: new Date(0).toISOString(),
      }),
    };
  }

  async load(): Promise<ImprovementStoreEnvelopeV2> {
    return loadVersionedJson(this.options());
  }

  async appendOutcome(
    outcome: CapabilityOutcomeV1,
    expectedRevision?: number,
  ): Promise<ImprovementStoreEnvelopeV2> {
    assertSafeOutcome(outcome);
    const { state } = await compareAndSwapVersionedJson({
      ...this.options(),
      expectedRevision,
      mutate: (snapshot) => {
        if (snapshot.outcomes.some((item) => item.id === outcome.id)) {
          throw new Error(`Capability outcome already exists: ${outcome.id}`);
        }
        snapshot.outcomes.push(structuredClone(outcome));
        snapshot.audit.push({
          id: `audit-outcome-${outcome.id}`,
          operation: "outcome.appended",
          targetId: outcome.id,
          recordedAt: outcome.recordedAt,
          reasonCodes: [],
          committedRevision: snapshot.revision + 1,
        });
      },
      updatedAt: (snapshot) => {
        snapshot.updatedAt = outcome.recordedAt;
      },
    });
    return state;
  }

  async upsertCandidate(
    candidate: ImprovementCandidateV1,
    expectedRevision?: number,
  ): Promise<ImprovementStoreEnvelopeV2> {
    assertSafeCandidate(candidate);
    const { state } = await compareAndSwapVersionedJson({
      ...this.options(),
      expectedRevision,
      mutate: (snapshot) => {
        const index = snapshot.candidates.findIndex(
          (item) => item.id === candidate.id,
        );
        if (index >= 0) snapshot.candidates[index] = structuredClone(candidate);
        else snapshot.candidates.push(structuredClone(candidate));
        snapshot.audit.push({
          id: `audit-candidate-${candidate.id}-${snapshot.revision + 1}`,
          operation: "candidate.upserted",
          targetId: candidate.id,
          recordedAt: candidate.createdAt,
          reasonCodes: [],
          committedRevision: snapshot.revision + 1,
        });
      },
      updatedAt: (snapshot) => {
        snapshot.updatedAt = candidate.createdAt;
      },
    });
    return state;
  }

  async recordDecision(
    decision: ImprovementPromotionDecisionV1,
    recordedAt: string,
    expectedRevision?: number,
  ): Promise<ImprovementStoreEnvelopeV2> {
    const { state } = await compareAndSwapVersionedJson({
      ...this.options(),
      expectedRevision,
      mutate: (snapshot) => {
        const candidate = snapshot.candidates.find(
          (item) => item.id === decision.candidateId,
        );
        if (!candidate) {
          throw new Error(
            `Improvement candidate not found: ${decision.candidateId}`,
          );
        }
        candidate.status =
          decision.decision === "promote"
            ? "active"
            : decision.decision === "reject"
              ? "rejected"
              : decision.decision === "rollback"
                ? "rolled_back"
                : "shadow";
        snapshot.audit.push({
          id: `audit-decision-${decision.candidateId}-${snapshot.revision + 1}`,
          operation: "candidate.decided",
          targetId: decision.candidateId,
          recordedAt,
          reasonCodes: [...decision.reasonCodes],
          committedRevision: snapshot.revision + 1,
        });
      },
      updatedAt: (snapshot) => {
        snapshot.updatedAt = recordedAt;
      },
    });
    return state;
  }

  async activate(
    candidateId: string,
    active: ActiveImprovementV2,
    recordedAt: string,
    expectedRevision?: number,
  ): Promise<ImprovementStoreEnvelopeV2> {
    const { state } = await compareAndSwapVersionedJson({
      ...this.options(),
      expectedRevision,
      mutate: (snapshot) => {
        const candidate = snapshot.candidates.find(
          (item) => item.id === candidateId,
        );
        if (!candidate) {
          throw new Error(`Improvement candidate not found: ${candidateId}`);
        }
        const key = targetKey(candidate);
        candidate.status = "active";
        snapshot.activeTargets[key] = structuredClone(active);
        snapshot.audit.push(
          {
            id: `audit-decision-${candidateId}-${snapshot.revision + 1}`,
            operation: "candidate.decided",
            targetId: candidateId,
            recordedAt,
            reasonCodes: ["all_promotion_gates_passed"],
            committedRevision: snapshot.revision + 1,
          },
          {
            id: `audit-activation-${candidateId}-${snapshot.revision + 1}`,
            operation: "target.activated",
            targetId: key,
            recordedAt,
            reasonCodes: [],
            committedRevision: snapshot.revision + 1,
          },
        );
      },
      updatedAt: (snapshot) => {
        snapshot.updatedAt = recordedAt;
      },
    });
    return state;
  }

  async rollbackActivation(
    candidateId: string,
    replacement: ActiveImprovementV2 | undefined,
    recordedAt: string,
    expectedRevision?: number,
  ): Promise<ImprovementStoreEnvelopeV2> {
    const { state } = await compareAndSwapVersionedJson({
      ...this.options(),
      expectedRevision,
      mutate: (snapshot) => {
        const candidate = snapshot.candidates.find(
          (item) => item.id === candidateId,
        );
        if (!candidate) {
          throw new Error(`Improvement candidate not found: ${candidateId}`);
        }
        const key = targetKey(candidate);
        candidate.status = "rolled_back";
        if (replacement) snapshot.activeTargets[key] = structuredClone(replacement);
        else delete snapshot.activeTargets[key];
        snapshot.audit.push(
          {
            id: `audit-decision-${candidateId}-${snapshot.revision + 1}`,
            operation: "candidate.decided",
            targetId: candidateId,
            recordedAt,
            reasonCodes: ["explicit_or_automatic_rollback"],
            committedRevision: snapshot.revision + 1,
          },
          {
            id: `audit-rollback-${candidateId}-${snapshot.revision + 1}`,
            operation: "target.rolled_back",
            targetId: key,
            recordedAt,
            reasonCodes: [],
            committedRevision: snapshot.revision + 1,
          },
        );
      },
      updatedAt: (snapshot) => {
        snapshot.updatedAt = recordedAt;
      },
    });
    return state;
  }

  async quarantineCandidate(
    candidateId: string,
    reasonCodes: string[],
    recordedAt: string,
    expectedRevision?: number,
  ): Promise<ImprovementStoreEnvelopeV2> {
    const { state } = await compareAndSwapVersionedJson({
      ...this.options(),
      expectedRevision,
      mutate: (snapshot) => {
        const candidate = snapshot.candidates.find(
          (item) => item.id === candidateId,
        );
        if (!candidate) {
          throw new Error(`Improvement candidate not found: ${candidateId}`);
        }
        candidate.status = "quarantined";
        snapshot.audit.push({
          id: `audit-quarantine-${candidateId}-${snapshot.revision + 1}`,
          operation: "candidate.quarantined",
          targetId: candidateId,
          recordedAt,
          reasonCodes: [...reasonCodes],
          committedRevision: snapshot.revision + 1,
        });
      },
      updatedAt: (snapshot) => {
        snapshot.updatedAt = recordedAt;
      },
    });
    return state;
  }
}
