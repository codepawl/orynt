# Glossary

Domain terms used in this project. Update as new terms emerge.

## Codepawl-specific

- **Pawl**: Internal nickname for the product family. The ratchet-pawl mechanism is the brand visual metaphor: small, deliberate, forward-only steps.
- **Ratchet orange**: `#FF6B1A`, the single accent color in the design system. Used for primary CTAs, links, and the cycling product highlight in the hero.
- **Ink palette**: The grayscale neutrals (`--ink-0` deepest, `--ink-6` muted border) that build all surface backgrounds.
- **Marketing route group**: Pages under `app/(marketing)/`. No Ant Design, pure Tailwind, ISR by default.
- **App route group**: Pages under `app/(app)/`. Uses Ant Design themed shell. Reserved for authenticated app surface (community, admin) and is mostly out of MVP scope.

## Product names

- **Openpawl**: Open runtime for coding-agent coordination. It turns agent tasks into plans, validations, guarded changes, and traceable run evidence. The first supported surface is GitHub Actions.
- **Featcat**: AI-powered feature catalog for data teams, Python, MIT. Scans Parquet, auto-docs columns with LLMs, detects PSI drift.
- **HebbMem**: Hebbian memory layer for AI agents, Python, MIT. Ebbinghaus decay, spreading activation, drop-in for LangChain and similar.
- **TurboQuant**: 3-bit vector quantization for KV cache and vector search, PyTorch, MIT.
- **Cachepawl**: Hybrid cache research for Mamba + MoE + Transformer hybrids. Pre-alpha.
- **KStudio**: Closed-source agentic studio. Invite-only. The commercial surface that wraps the open products.

## Technical

- **ISR**: Incremental Static Regeneration. Next.js pattern where static pages re-render in the background after a set interval. We use it on all marketing pages.
- **Double opt-in**: Newsletter pattern where the user must click a confirmation link emailed to them before being added to the active list. Reduces spam, improves deliverability.
- **Single gateway**: Architectural rule that Next.js never connects to Supabase directly. FastAPI is the only consumer of the DB credentials and the only place auth and rate limit checks live.
- **Sharp corners**: Design system rule that `border-radius` is `0` everywhere except pill-shaped tags. Set in `@theme` so Tailwind utilities like `rounded-md` resolve to `0px`.
