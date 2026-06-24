# Semantic UI Graph Runtime

Generated: 2026-06-24

## Problem

Screenshots are expensive and ambiguous. Full DOM dumps are noisy. Accessibility snapshots are better, but can still be too large on complex pages. CodePawl needs its own semantic UI graph optimized for agent action selection.

## SemanticElement schema

```ts
export interface SemanticElement {
  id: string;
  surfaceId: string;
  role: string;
  name?: string;
  text?: string;
  value?: string;
  placeholder?: string;
  description?: string;
  selector?: string;
  ref?: string;
  bbox?: BoundingBox;
  visible: boolean;
  enabled: boolean;
  focused: boolean;
  checked?: boolean;
  expanded?: boolean;
  selected?: boolean;
  required?: boolean;
  parentId?: string;
  childrenIds: string[];
  ownerDialogId?: string;
  formId?: string;
  riskFlags: RiskFlag[];
  supportedActions: ElementAction[];
  confidence: number;
}
```

## Graph construction

Input sources:

- accessibility snapshot
- DOM query output
- active element
- visible viewport
- form ownership
- modal/dialog detection
- screenshot fallback metadata

Normalization:

- merge nodes that refer to same visual/control target
- remove hidden/inert elements
- infer labels for unlabeled inputs
- group controls into forms/dialogs
- assign stable ids
- compute actionability

## Candidate packet

The model should not see every element. It should receive a ranked candidate packet:

```text
Task: Fill invoice search form.
State: URL=/reports, title=Reports, modal=none
Candidates:
I04 textbox "Invoice ID" value="" required=true action=fill
B08 button "Search" enabled=true action=click
L12 link "Advanced filters" action=click
Risk: low until submit/export
```

## Diffing

After each action, compute:

- appeared elements
- disappeared elements
- changed labels/values
- active element change
- URL/title changes
- network/console deltas
- screenshot hash/crop changes when needed

## Why this matters

The Semantic UI Graph is the main moat. It allows CodePawl to:

- reduce token usage
- support weaker models
- avoid coordinate guessing
- verify state changes
- replay skills
- explain actions to users
