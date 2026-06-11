# Product

## Openpawl release maturity (CLI agent engine)

Openpawl runtime source of truth is the public repository at
`codepawl/openpawl@v0.5.1`. Private `packages/core`, `packages/cli`, and
`packages/shared` are frozen compatibility copies and are not the active
development surface.

- **Alpha history**
  - `v0.1.0-alpha.1`: Foundation, deterministic mock provider, local dry-run, PR workflow verification, metadata-only patch planning.
  - `v0.1.0-alpha.2`: Experimental provider integration, structured-output retry/failure diagnostics, safe trace metadata.
  - `v0.1.0-alpha.3`: `json_schema` strict provider mode, context compaction, grounding/rejection of invented paths, dry-run scope fallback, and safe write-mode v0 (create-only test files).
  - `v0.1.0-alpha.9`: first external installability cut with repo-root config, reusable workflow template, install docs, and safer write-mode defaults.
  - `v0.1.0-alpha.10`: exact `@openpawl` mention UX with dry-run-only comment triggers, direct public Openpawl CLI workflow invocation, and live issue/PR verification.
  - `v0.1.0-beta.1`: approval write mode with `/openpawl apply` and `openpawl-approved`, bot-branch PR persistence, and deterministic patch quality harness.

- **Current publish posture**
  - Use the public `codepawl/openpawl@v0.5.1` Action release for installs.
  - Do not publish npm packages from this private repository.
  - Keep the GitHub Marketplace listing pending until the listing URL exists and has been verified.
  - Stable publish should wait for safe write-mode and broader real-repo validations in the public Openpawl repository.

- **Next maturity gates**
  - RC: multiple real repositories validated, provider compatibility matrix completed.
  - 0.1.0 stable: complete external release confidence and documented security guardrails.

## What we are building

CodePawl makes coding agents work together. It is infrastructure for coordinated agent work - plans, evidence, guardrails, memory, replay, and cloud workflows. The core product is **Openpawl**, an open runtime for coding-agent coordination. It turns agent tasks into plans, validations, guarded changes, and traceable run evidence. The first supported surface is GitHub Actions with conservative write-mode guardrails. The project also houses a product catalog, curated AI/ML research, technical documentation, and waitlist signups.

## Who it is for

Primary audience, in priority order:

1. **AI/ML engineers building production agents.** They want vetted libraries and guarded automation workflows like Openpawl that they can evaluate safely. They evaluate by reading the README, checking last commit date, and skimming validation evidence.
2. **ML practitioners and researchers** reproducing papers or exploring memory, quantization, hybrid architectures. They want code that runs and reports that show the numbers held up.
3. **AI-curious developers** following the field through curated, low-noise channels. They want a non-Twitter, non-HN, AI-focused feed.

Geographic skew: Vietnamese AI/ML scene is a strategic beachhead. Site is English-first, no Vietnamese localization in MVP.

## The problem

AI/ML output is scattered. New libraries land on GitHub, get a tweet, get an HN thread, vanish. Papers get a Twitter thread that does not link the code, code that does not match the paper, and a benchmark table no one reproduced. Vietnamese AI/ML developers in particular lack a hub.

## What they do today

- Skim Twitter, HN, r/MachineLearning, r/LocalLLaMA
- Watch GitHub trending and a few curated newsletters (TLDR AI, Latent Space, The Batch)
- Bookmark papers in Zotero or a Notion page that nobody else reads
- Find Vietnamese AI/ML peers in scattered Discord and Facebook groups

## Value proposition

One surface for: products you can run, research you can reproduce, news you can trust. Built by people shipping the same kind of work.

The differentiator is not "another AI news site." It is the **product catalog**: our flagship coordination runtime **Openpawl** and its supporting tools maintained by the same team, with shared design language and a coherent story about coordination, evidence, memory, and compute.

## Success metric for MVP

The MVP ships when these are true 30 days after public launch:

- 1000 monthly active visitors
- 100 newsletter confirmed subscribers (double opt-in)
- 6 product pages live with up-to-date GitHub stats
- 5 original blog posts published
- KStudio invite waitlist captures 50 emails

These are absolute thresholds, not stretch goals. If we hit them, we have demand and we know what to build next. If we miss them all by 50%, we have a positioning problem to fix before adding features.
