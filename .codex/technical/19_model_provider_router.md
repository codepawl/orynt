# Model Provider Router

## MVP decision

Use BYOK first. This avoids inference-margin risk while validating the desktop product.

## Location

For MVP, provider calls may live in the Node sidecar because the orchestration and context packet builder are there. Provider keys should be retrieved through Rust secure storage and never exposed to the renderer.

## Interface

```ts
export interface ModelProvider {
  id: string;
  completeAction(input: ActionModelInput, options: ModelCallOptions): Promise<ActionModelOutput>;
  summarize?(input: SummarizeInput): Promise<SummarizeOutput>;
  classifyRisk?(input: RiskInput): Promise<RiskOutput>;
}
```

## Routing

```text
simple action selection -> cheaper model
ambiguous UI -> stronger model
verification -> deterministic/small model
recovery -> stronger model
replay -> no model unless divergence
```

## Key handling

- Rust stores keys in OS keychain.
- Sidecar requests provider client token/key only when needed.
- Redact keys from all logs.
- Renderer never sees keys.
