# API Contracts and Types

Generated: 2026-06-24

## Shared type package

All runtime packages should import shared product types from `packages/shared`, sidecar/app protocol schemas from `packages/ipc-contracts`, and surface interfaces from `packages/surface-core`.

## Important contracts

### TaskIntent

```ts
export interface TaskIntent {
  id: string;
  userPrompt: string;
  goal: string;
  constraints: string[];
  successCriteria: string[];
  riskTolerance: 'low' | 'medium';
  budget: TokenBudget;
}
```

### ContextPacket

```ts
export interface ContextPacket {
  runId: string;
  step: number;
  stablePolicyVersion: string;
  taskSummary: string;
  stateSummary: string;
  candidates: CandidateAction[];
  lastResult?: VerificationResult;
  budgetStatus: BudgetStatus;
  tracePointers: string[];
  estimatedTokens: number;
}
```

### CandidateAction

```ts
export interface CandidateAction {
  id: string;
  type: ActionType;
  targetElementId?: string;
  label: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  confidence: number;
  expectedResultTemplate: string;
}
```

### PolicyDecision

```ts
export interface PolicyDecision {
  status: 'allow' | 'deny' | 'requires_approval';
  reasons: string[];
  approvalCard?: ApprovalCard;
}
```

### ModelAdapter

```ts
export interface ModelAdapter {
  provider: string;
  completeAction(input: ModelActionRequest): Promise<ModelActionResponse>;
  estimateTokens?(input: unknown): Promise<TokenEstimate>;
}
```

## Validation rules

- Every external boundary uses Zod validation.
- Model output is untrusted input.
- Tool output is untrusted input.
- Webpage content is untrusted input.
- User-provided files are untrusted input.

## Done when

Type contracts compile and can be used by browser adapter, orchestrator, policy engine, token engine, and UI without circular dependencies.
