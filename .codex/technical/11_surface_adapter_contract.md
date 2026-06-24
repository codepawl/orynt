# SurfaceAdapter Contract

## Purpose

`SurfaceAdapter` prevents CodePawl from becoming browser-only.

```ts
export interface SurfaceAdapter {
  readonly kind: SurfaceKind;
  readonly capabilities: SurfaceCapability[];
  initialize(input: SurfaceInitInput): Promise<SurfaceSession>;
  observe(session: SurfaceSession): Promise<RawSurfaceObservation>;
  buildGraph(observation: RawSurfaceObservation): Promise<ObservationGraph>;
  listActions(graph: ObservationGraph): Promise<CandidateAction[]>;
  execute(session: SurfaceSession, action: CompiledAction): Promise<ActionResult>;
  verify(session: SurfaceSession, expected: ExpectedResult): Promise<VerificationResult>;
  dispose(session: SurfaceSession): Promise<void>;
}

export type SurfaceKind = 'browser' | 'desktop' | 'filesystem' | 'terminal';
```

## MVP adapter

`BrowserSurfaceAdapter` lives in the Node sidecar and uses Playwright.

## Future adapters

```text
DesktopSurfaceAdapter      -> Rust/native OS APIs plus vision fallback
FilesystemSurfaceAdapter   -> Rust host, read-only first
TerminalSurfaceAdapter     -> Rust host or sidecar, approval-gated
```

## Adapter rules

Adapters must not bypass permission policy. They report possible actions and execute only compiled/approved actions.
