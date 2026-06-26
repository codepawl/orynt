Goal: Integrate the first complete Coding Apprentice vertical slice into the existing CodePawl UI without turning the product into a developer debug console.

Context:
- Inspect the existing UI/UX and completed runtime modules.
- Inspect the Run, Tasks, Permissions, Usage, and Settings screens.
- Inspect `.codex/plan/cldsa-lite/plans/04_MVP_VERTICAL_SLICE_CODING_APPRENTICE.md`.

Constraints:
- Keep the default experience simple: task input, active status, useful timeline, approvals, diff, validation, budget, and final verdict.
- Raw provider events and internal memory details remain collapsible.
- Preserve Discord-like navigation and ChatGPT/Codex/Claude-style command surface.
- Permissions and budget must remain visible during execution.
- Do not expose unsupported future capability packs as working features.
- Accessibility, keyboard navigation, loading, empty, offline, cancellation, and failure states are required.

Done when:
- A user can select a fixture repo, start a task, monitor Codex progress, approve or reject a risky step, view diff and validation evidence, see cost/budget, review the final verdict, and respond to a candidate learning item.
- All UI states are backed by typed runtime contracts rather than hard-coded mock shapes.
- End-to-end fixture flow, accessibility checks, lint, typecheck, tests, and build pass.
