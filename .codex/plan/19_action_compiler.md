# Action Compiler

Generated: 2026-06-24

## Purpose

The model chooses semantic actions. The Action Compiler turns those actions into concrete surface operations.

## Model action schema

```ts
export const ModelActionSchema = z.object({
  action: z.enum(['click', 'fill', 'select', 'press', 'scroll', 'waitFor', 'navigate', 'askUser', 'finish']),
  targetId: z.string().optional(),
  value: z.string().optional(),
  expectedResult: z.string(),
  confidence: z.number().min(0).max(1),
  risk: z.enum(['low', 'medium', 'high']),
  rationale: z.string().max(280)
});
```

## Compile steps

1. Validate JSON.
2. Validate target exists.
3. Validate target is visible/enabled/actionable.
4. Check policy approval requirements.
5. Resolve selector/ref.
6. Execute with adapter.
7. Capture result.
8. Run verifier.
9. Emit trace event.

## Compiler guarantees

- No free-form shell execution.
- No arbitrary JS eval from model output.
- No coordinate click unless fallback explicitly approved by runtime.
- No high-risk action without approval card.
- No action against stale observations without refresh.

## Recovery

On failure:

- refresh observation
- diagnose failure mode
- retry only if safe and bounded
- ask user when confidence remains low
- escalate to stronger model if configured

## Output

```ts
export interface ActionResult {
  status: 'success' | 'failed' | 'blocked' | 'requires_approval';
  actionId: string;
  startedAt: string;
  endedAt: string;
  surfaceResult?: unknown;
  verification?: VerificationResult;
  error?: ActionError;
  traceRefs: ArtifactRef[];
}
```
