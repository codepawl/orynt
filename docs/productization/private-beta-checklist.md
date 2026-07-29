# Private Beta Checklist

Status: launch-prep checklist for local/private beta only.

## Product Scope

- [x] Repository-scoped supervised Coding Apprentice walkthrough exists.
- [x] Permission and policy gates block secrets, protected paths, dangerous commands, broad writes, and network by default.
- [x] Usage ledger and quota display exist for local/demo state.
- [x] Deterministic eval harness covers safe, low-risk, sensitive, blocked, prompt-injection, memory, and cost scenarios.
- [ ] Hosted account, billing, and subscription systems are intentionally not implemented in this checkout.
- [ ] Browser, desktop, files, and terminal execution remain out of P0 unless a future policy explicitly enables them.

## Onboarding Copy Requirements

- Explain that Orynt is supervised and local-first for the MVP.
- Explain that repository is the only enabled execution surface in the current beta.
- Explain that sensitive actions require approval, blocking, or user takeover.
- Explain BYOK versus managed AI before the user starts a run.
- Explain that managed AI credits reset monthly even on longer billing cadences.
- Avoid promising autonomous completion, background execution, or payment/credential handling.

## Paddle Review Prep

- [x] Draft product copy exists in `docs/productization/paddle-product-copy.md`.
- [x] Plans are represented in `packages/shared/src/productPlans.ts`.
- [x] Copy separates Core BYOK, Managed AI, and Pro/Gateway.
- [x] Gateway copy avoids payment-gateway and marketplace framing.
- [ ] Final Paddle product IDs, prices, tax settings, and webhooks must be configured outside this repository.
- [ ] Legal review is required before public privacy, refund, or terms publication.

## Release Gates

- [ ] `pnpm test:contracts`
- [ ] `pnpm test:eval`
- [ ] `pnpm --filter @codepawl/coding-apprentice test -- index.test.ts`
- [ ] `pnpm --filter @codepawl/desktop test -- App.test.tsx`
- [ ] `pnpm walkthrough:smoke`
- [ ] Manual review of changed public copy for unsupported guarantees.
- [ ] Secret scan over release artifacts and docs.
