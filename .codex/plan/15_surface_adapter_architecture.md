# Surface Adapter Architecture

Generated: 2026-06-24

## Purpose

Surface Adapters prevent CodePawl from becoming browser-only.

Browser is just the first adapter. Future adapters may include desktop apps, filesystem, terminal, OS notifications, window manager, and app-specific APIs.

## Core interface

```ts
export type SurfaceKind = 'browser' | 'desktop' | 'filesystem' | 'terminal' | 'native-app';

export interface SurfaceAdapter {
  id: string;
  kind: SurfaceKind;
  displayName: string;

  observe(input: ObserveInput): Promise<ObservationGraph>;
  listActions(observation: ObservationGraph, intent: TaskIntent): Promise<CandidateAction[]>;
  execute(action: CompiledAction): Promise<ActionResult>;
  verify(check: ExpectedResult): Promise<VerificationResult>;
  getPermissions(): Promise<SurfacePermission[]>;
}
```

## ObservationGraph

```ts
export interface ObservationGraph {
  surfaceId: string;
  capturedAt: string;
  root: ObservationNode;
  elements: SemanticElement[];
  activeElementId?: string;
  modalElementId?: string;
  url?: string;
  title?: string;
  screenshotRef?: ArtifactRef;
  rawRefs: RawObservationRef[];
  diffFromPrevious?: ObservationDiff;
  tokenEstimate: number;
}
```

## Design rules

- Generic contracts must not depend on Playwright.
- Adapters may store raw observations out-of-context.
- Model packets should receive compact summaries, not adapter internals.
- Actions must include expected result and risk metadata.
- Verifier must be separate from executor.

## Future desktop adapters

### macOS

- Accessibility API.
- AppleScript/JXA where appropriate.
- ScreenCaptureKit fallback.

### Windows

- UI Automation.
- PowerShell for controlled system queries.
- Win32/window tree fallback.

### Linux

- AT-SPI accessibility.
- DBus/window manager APIs.
- xdotool/ydotool fallback only under approval.

## Surface priority

1. Browser.
2. Filesystem read/export helper.
3. Terminal read-only helper.
4. Desktop observation.
5. Desktop action.
6. Cross-surface workflows.
