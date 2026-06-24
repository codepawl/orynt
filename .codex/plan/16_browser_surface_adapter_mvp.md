# Browser Surface Adapter MVP

Generated: 2026-06-24

## Goal

Implement the first production-quality Surface Adapter for Chromium browser control.

## Responsibilities

- Launch browser.
- Manage contexts/profiles.
- Navigate pages.
- Capture accessibility snapshot.
- Extract DOM candidates.
- Capture screenshot/crops when needed.
- Execute click/fill/select/scroll/wait/navigation.
- Collect console/network events.
- Verify action results.

## Observation sources

1. Accessibility tree.
2. DOM selectors.
3. URL/title/navigation events.
4. Network and console events.
5. Screenshot/crop fallback.

## Candidate actions

P0 action set:

```ts
type BrowserAction =
  | { type: 'navigate'; url: string }
  | { type: 'click'; targetId: string }
  | { type: 'fill'; targetId: string; value: string }
  | { type: 'select'; targetId: string; value: string }
  | { type: 'press'; key: string }
  | { type: 'scroll'; direction: 'up' | 'down'; amount: 'small' | 'medium' | 'large' }
  | { type: 'waitFor'; condition: WaitCondition };
```

## Element ranking

Rank elements by:

- visible/enabled status
- semantic role
- label/name similarity to goal
- proximity to active form/dialog
- modal ownership
- actionability
- prior success on same site
- risk level

## Verifier examples

- URL changed.
- Element value changed.
- New element appeared.
- Toast/message appeared.
- Network request started/completed.
- Console error appeared.
- No state change after click.

## Failure modes to detect

- Stale selector.
- Overlay blocking target.
- Hidden modal.
- Autocomplete dropdown intercepting action.
- Page re-render after observation.
- Click returns success but no UI change.
- Form validation failed.
- Navigation timeout.

## Token budget rule

Default context packet should contain top-k candidate actions and small UI region summaries. Full accessibility tree and screenshots stay in trace storage unless explicitly needed.
