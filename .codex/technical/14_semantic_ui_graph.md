# Semantic UI Graph Runtime

## Objective

Transform browser observations into compact UI graphs that models can act on cheaply.

```ts
export interface UiNode {
  id: string;
  role: string;
  name?: string;
  text?: string;
  value?: string;
  state: {
    visible: boolean;
    enabled: boolean;
    focused: boolean;
    checked?: boolean;
    expanded?: boolean;
    required?: boolean;
  };
  geometry?: Rect;
  selectorHints: SelectorHint[];
  parentId?: string;
  riskHints?: RiskHint[];
  confidence: number;
}

export interface ObservationGraph {
  snapshotId: string;
  surfaceId: string;
  surfaceKind: SurfaceKind;
  url?: string;
  title?: string;
  nodes: Record<string, UiNode>;
  modalStack: string[];
  focusedNodeId?: string;
  hash: string;
  diff?: GraphDiff;
}
```

## Candidate generation

Generate candidate actions before calling the model:

```text
A01 fill I02 "Email" confidence=0.96 risk=low
A02 fill I03 "Password" confidence=0.94 risk=low
A03 click B04 "Sign in" confidence=0.91 risk=medium
```

## Model context rule

The model receives `ContextPacket`, not the full graph. Full graph remains local in the sidecar/trace store.
