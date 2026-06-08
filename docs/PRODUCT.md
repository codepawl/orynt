# Product

## Openpawl release maturity (CLI agent engine)

- **Alpha history**
  - `v0.1.0-alpha.1`: Foundation, deterministic mock provider, local dry-run, PR workflow verification, metadata-only patch planning.
  - `v0.1.0-alpha.2`: Experimental provider integration, structured-output retry/failure diagnostics, safe trace metadata.
  - `v0.1.0-alpha.3`: `json_schema` strict provider mode, context compaction, grounding/rejection of invented paths, dry-run scope fallback, and safe write-mode v0 (create-only test files).

- **Current publish posture**
  - Keep GitHub Releases as the release mechanism for alpha.
  - Do not publish to npm until package metadata, license, exports, and install path are fully verified.
  - NPM alpha publish is acceptable only after clean install from a packed tarball in a temporary repo.
  - Stable publish should wait for safe write-mode and broader real-repo validations.

- **Next maturity gates**
  - Beta: safe write-mode v0, explicit test command, non-overwrite guarantees.
  - RC: multiple real repositories validated, provider compatibility matrix completed.
  - 0.1.0 stable: complete external release confidence and documented security guardrails.

## What we are building

CodePawl is a server-side coding-agent ecosystem designed for autonomous software development. The core product is **Openpawl**, an open-source autonomous agent engine. Internally, it relies on advanced **Trace Ledger** and **Memory** modules to coordinate agent execution and maintain state history. The project also houses a product catalog (supporting tools like Featcat, HebbMem, TurboQuant, Cachepawl, and KStudio), curated AI/ML research, technical documentation, and waitlist signups.

## Who it is for

Primary audience, in priority order:

1. **AI/ML engineers building production agents.** They want vetted libraries and agent orchestration frameworks like Openpawl that they can drop into a stack. They evaluate by reading the README, checking last commit date, and skimming benchmarks.
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

The differentiator is not "another AI news site." It is the **product catalog**: our flagship open-source developer agent engine **Openpawl** and its supporting tools (Featcat, HebbMem, TurboQuant, Cachepawl, KStudio) maintained by the same team, with shared design language and a coherent story about agents, memory, and compute.

## Success metric for MVP

The MVP ships when these are true 30 days after public launch:

- 1000 monthly active visitors
- 100 newsletter confirmed subscribers (double opt-in)
- 6 product pages live with up-to-date GitHub stats
- 5 original blog posts published
- KStudio invite waitlist captures 50 emails

These are absolute thresholds, not stretch goals. If we hit them, we have demand and we know what to build next. If we miss them all by 50%, we have a positioning problem to fix before adding features.
