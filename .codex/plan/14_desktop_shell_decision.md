# Desktop Shell Decision: Tauri v2 Only

Generated: 2026-06-24

## Requirement

CodePawl needs a desktop shell because full-system control is the long-term direction. The shell must support secure local storage, local browser automation, file access with permissions, future OS accessibility APIs, and a polished UI.

## Decision: Tauri v2

CodePawl supports Tauri v2 as the only desktop shell. Electron is intentionally out of scope because the app should stay lightweight, local-first, and disciplined around host/renderer boundaries.

Advantages:

- Smaller app footprint.
- Strong host/guest separation mental model.
- Capability and permission configuration for frontend access.
- Better fit for future OS-level integrations.
- Avoids shipping a second full Chromium runtime for the app shell.

Risks:

- Browser automation still likely runs in Node/Playwright sidecar.
- WebView differences may complicate UI testing.
- Tauri plugin ecosystem may require more Rust work.
- Node/Playwright integration must be designed explicitly instead of relying on Electron's Node runtime.

## Non-goal: Electron

Do not add Electron as a fallback, prototype target, or packaging path.

Reasons:

- It increases binary size and memory footprint.
- It weakens the product direction toward a lean local desktop control plane.
- It encourages coupling the UI shell to Node/browser automation concerns.
- It adds a separate security hardening track that CodePawl does not need for MVP.

## Runtime integration direction

Use Tauri for the desktop shell and privileged host boundary. Run Playwright/model-provider work in a Node.js sidecar or runtime worker with a narrow, validated IPC contract.

The sidecar must be treated as its own trust boundary:

- Tauri commands expose only approved operations.
- IPC payloads are schema-validated.
- Browser/runtime capabilities are scoped per workspace.
- Secrets are stored through OS keychain or equivalent secure storage.
- The frontend never receives broad filesystem or process access.

## Recommendation

Proceed directly with Tauri v2. The first implementation spike should answer:

- Can the shell launch the controlled browser runtime?
- Can it store local traces?
- Can it protect secrets?
- Can it package reliably?
- Can it support the planned UI?

Then write an ADR that records Tauri-only support and the sidecar IPC design.
