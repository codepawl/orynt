# Canonical Data Contracts

The exact schema may evolve, but these concepts must be explicit from the first implementation.

## Run

```ts
type RunStatus =
  | "created"
  | "preparing"
  | "observing"
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "verifying"
  | "learning"
  | "completed"
  | "failed"
  | "paused"
  | "cancelled";

interface Run {
  id: string;
  capabilityId: string;
  taskId: string;
  status: RunStatus;
  workspaceId: string;
  providerId: string;
  policyMode: "manual" | "safe" | "balanced" | "experimental";
  budget: RunBudget;
  createdAt: string;
  updatedAt: string;
}
```

## Run event

```ts
interface RunEvent<T = unknown> {
  id: string;
  runId: string;
  sequence: number;
  type: RunEventType;
  timestamp: string;
  source: string;
  payload: T;
  redaction: RedactionMetadata;
  provenance?: Provenance;
}
```

## Task state and bounded workspace

```ts
interface TaskState {
  goal: string;
  activeSubgoal?: string;
  completedSubgoals: SubgoalSummary[];
  constraints: Constraint[];
  openQuestions: string[];
  currentArtifacts: ArtifactRef[];
  recentVerdicts: VerificationSummary[];
}

interface ContextWorkspace {
  task: TaskState;
  currentObservation: Observation;
  selectedEpisodes: EpisodeSummary[];
  selectedRules: ProjectRule[];
  selectedSkills: SkillSummary[];
  capabilityProfile: CapabilityEstimate;
  control: OperationalState;
}
```

## Action

```ts
interface ActionProposal {
  id: string;
  type: string;
  target?: ActionTarget;
  intent: string;
  expectedResult: ExpectedResult;
  risk: RiskAssessment;
  confidence: number;
  estimatedCost: CostEstimate;
  source: "planner" | "skill" | "recovery" | "user";
}

interface ActionDecision {
  proposalId: string;
  decision: "allow" | "require_approval" | "deny" | "defer";
  reasons: PolicyReason[];
  compiledAction?: CompiledAction;
}
```

## Verification

```ts
interface VerificationResult {
  status: "pass" | "partial" | "fail" | "inconclusive";
  score?: number;
  expected: ExpectedResult;
  actual: ActualResult;
  evidence: EvidenceRef[];
  failureClass?: FailureClass;
  confidence: number;
}
```

## Memory

```ts
interface MemoryItem {
  id: string;
  kind: "episode" | "project_rule" | "skill" | "failure_pattern";
  maturity: "raw" | "candidate" | "stable" | "superseded" | "archived";
  scope: MemoryScope;
  content: unknown;
  evidence: EvidenceRef[];
  confidence: number;
  createdAt: string;
  lastVerifiedAt?: string;
  validFrom?: string;
  validUntil?: string;
  supersededBy?: string;
}
```

## Core policy

```ts
interface CorePolicy {
  protectedPaths: string[];
  blockedCommands: CommandRule[];
  approvalRules: ApprovalRule[];
  networkPolicy: NetworkPolicy;
  secretPolicy: SecretPolicy;
  defaultBudgets: RunBudget;
  immutableFields: string[];
}
```

## Operational state

Do not call this emotion in implementation.

```ts
interface OperationalState {
  uncertainty: number;
  resourcePressure: number;
  riskPressure: number;
  goalProgress: number;
  repeatedFailure: number;
  verificationBias: number;
  explorationBias: number;
}
```
