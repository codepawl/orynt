# Product UI Battle v22

## Decision

Project Board is functionally sound for its current small local workload, but
its visual quality, authored-source readability, and end-to-end execution
latency are not yet sufficient to advance the campaign.

## Implementation

- Ship a concise implicit `product-ui-design` built-in for interactive product
  surfaces and attach it deterministically during eligible headless runs.
- Render executed Codex contracts with repository-relative tool paths while
  preserving real sandbox paths in audit metadata.
- Add a fail-closed Luna-low screenshot reviewer with deterministic scoring,
  bounded usage, and immutable battle artifacts.
- Reject manually minified authored Project Board sources in the hidden oracle.

## Acceptance

- Orynt execution through deterministic verification is at most 300 seconds.
- Oracle and visual review fit within 60 seconds; total wall time is at most
  360 seconds.
- Total provider input is at most 360,000 tokens.
- Functional, scope, runtime-evidence, source-readability, and visual gates pass
  in one no-retry Project Board canary before advancing to Support Desk.
