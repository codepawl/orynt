# Action Compiler and Verifier

## Model action schema

```ts
export const ModelActionSchema = z.object({
  action: z.enum(['click','fill','select','press','scroll','navigate','wait','extract','ask_user','finish']),
  targetId: z.string().optional(),
  value: z.string().optional(),
  expectedResult: z.string().min(1),
  confidence: z.number().min(0).max(1),
  risk: z.enum(['low','medium','high']),
  reasoningSummary: z.string().max(500),
});
```

Do not ask for private chain-of-thought. Store only a short visible reasoning summary.

## Execution pipeline

```text
model JSON
-> schema validation
-> target resolution
-> policy check through Rust host if risky
-> selector strategy
-> Playwright action
-> observe again
-> verify expected result
-> persist trace event
```

## Selector priority

```text
role/name locator
test id / aria label
label association
stable CSS
XPath fallback
coordinate fallback only if explicitly allowed
```

## Silent failure detection

A click is suspicious if action returns success but URL, DOM graph, focus, modal state, and network state do not change and expected result is unmet.
