# Model Provider Adapters

Generated: 2026-06-24

## Goal

Make model providers replaceable.

## Supported providers for MVP

- OpenAI adapter.
- Anthropic adapter.
- Gemini adapter optional.
- Ollama/local adapter optional but important for weak-model narrative.

## Provider abstraction

The orchestrator should ask for capabilities, not provider names:

```ts
type ModelCapability =
  | 'structured_json'
  | 'vision'
  | 'long_context'
  | 'low_cost'
  | 'local'
  | 'fast_verifier';
```

## Routing profile

```ts
export interface RoutingProfile {
  planner: ModelSelector;
  actor: ModelSelector;
  verifier: ModelSelector;
  recovery: ModelSelector;
  extraction: ModelSelector;
  maxCostPerRun?: number;
}
```

## Provider safety

- Never log API keys.
- Use OS keychain/secret store.
- Show which page data will be sent to provider.
- Allow local-only mode.
- Allow per-workspace provider settings.

## Prompt differences

Keep provider-specific formatting in adapters. Keep core runtime provider-agnostic.

## Done when

A run can switch provider from settings without changing browser adapter or orchestrator logic.
