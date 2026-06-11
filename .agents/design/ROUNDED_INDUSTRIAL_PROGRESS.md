# Rounded-Industrial Migration Progress

- Checkpoint 1: inspected web app tokens, globals, marketing components, route components, and tests; confirmed migration can be handled through tokens and shared classes without app structure changes.
- Checkpoint 1: created design system note under `.agents/design/`.
- Checkpoint 2: added centralized `--cp-radius-*` tokens and Tailwind radius aliases.
- Checkpoint 3: started shared component migration through `cp-card`, `cp-control`, `cp-menu`, `cp-small-surface`, and existing hover/control primitives.
- Checkpoint 4: audited `/`, Openpawl Marketplace-critical pages, status/legal/security pages, `/contact`, and `/pricing`; no `/cloud` route exists, and Cloud waitlist remains routed through `/contact`.
- Validation: typecheck, unit tests, build, preview route smoke, webhook GET guard, visual screenshots, computed radius checks, and `git diff --check` passed.
