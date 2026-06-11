# CodePawl Website And Cloud Master Plan

Date: 2026-06-11

Status: planning only. Do not edit website code from this document without a separate implementation pass.

## Executive Verdict

`PLAN_READY_IMPLEMENTATION_PAUSED`

The website should reposition from a broad "AI agent infrastructure platform" claim to a staged product architecture:

- Openpawl: public, usable, dry-run-first GitHub Action/TUI surface.
- CodePawl Cloud: upcoming hosted control plane and evidence hub, not available yet.
- TracePawl, Mempawl, and CachePawl: future product layers that should be presented as roadmap layers until there is public evidence and installable product surface.

The immediate website problem is trust alignment. The live site presents a four-product production-agent platform, but the only current public product with strong Marketplace evidence is Openpawl in `codepawl/openpawl`. The Marketplace-critical URLs requested for the listing are currently missing on the live site and must be created or routed before submission.

## Sources Inspected

Local repository:

- `README.md`
- `docs/MARKETPLACE.md`
- `docs/OPENPAWL_INSTALL.md`
- `docs/OPS.md`
- `docs/API.md`, `docs/DATA.md`, `docs/UI.md`, `docs/DECISIONS.md`, `docs/SCOPE.md`
- `apps/web/src/router.tsx`
- `apps/web/src/routes/*`
- `apps/web/components/marketing/*`
- `apps/web/app/globals.css`
- `apps/web/styles/design-tokens.css`
- `apps/web/components/posthog-provider.tsx`
- `apps/web/components/marketing/contact-form.tsx`
- `apps/web/components/marketing/footer-newsletter-form.tsx`
- `apps/web/src/routes/api.github.marketplace.ts`

Live/current checks:

- `https://codepawl.com/`
- `https://codepawl.com/products/openpawl`
- `https://codepawl.com/docs/openpawl`
- `https://codepawl.com/contact`
- `https://codepawl.com/api/github/marketplace`
- `codepawl/openpawl` GitHub repository status via GitHub CLI
- GitHub Actions run list for `codepawl/openpawl`
- GitHub Docs for publishing actions in Marketplace and action metadata syntax:
  - `https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace`
  - `https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax`

No uploaded local HTML snapshot was found in the repository. The live HTML snapshot was inspected from `https://codepawl.com/`.

## Audit Findings

### Repository And App Structure

- Web app lives under `apps/web` and uses TanStack Router/Start with routes registered in `apps/web/src/router.tsx`.
- Site layout is `apps/web/src/routes/site.tsx`, which wraps the marketing nav/footer around most public pages.
- Current public route set includes:
  - `/`
  - `/products`
  - `/products/$slug`
  - `/docs`
  - `/docs/$`
  - `/research`
  - `/blog`
  - `/contact`
  - `/careers`
  - `/pricing`
  - `/newsletter/confirm`
  - `/api/github/marketplace`
- The router does not currently define:
  - `/openpawl/install`
  - `/openpawl/docs`
  - `/openpawl/support`
  - `/status`
  - `/privacy`
  - `/terms`
  - `/cloud`
  - `/cloud/waitlist`
- Footer already links to `/privacy` and `/terms`, but those routes 404.
- `apps/web/components/marketing/products.ts` still maps Openpawl to `github_repo: "codepawl/codepawl"`, while the public Marketplace candidate now lives at `codepawl/openpawl`.
- The rendered Openpawl docs page currently says docs are sourced from `codepawl/codepawl`; that is stale for the public action repo.

### Live Site Findings

- Homepage is live and visually matches the local app.
- Live homepage title: `CodePawl - Infrastructure for AI agents`.
- Live homepage meta description: `Debugging, memory, coordination, and optimization infrastructure for AI agents.`
- Live `/products/openpawl` returns `200`, but the captured HTML showed a docs-style page and stale monorepo copy. Treat this as a routing/content bug to verify during implementation.
- Live `/docs/openpawl` returns `200`, but is a placeholder.
- Live `/contact` returns `200`.
- Live `/api/github/marketplace` returns `405` for GET with method-not-allowed JSON, which is correct for a POST-only webhook.
- Live Marketplace-critical URLs currently return `404`:
  - `/openpawl/install`
  - `/openpawl/docs`
  - `/openpawl/support`
  - `/status`
  - `/privacy`
  - `/terms`

### Openpawl Public Repo Status

Current public status checked on 2026-06-11:

- Repository: `https://github.com/codepawl/openpawl`
- Visibility: `PUBLIC`
- Default branch: `main`
- Root `action.yml`: present on `main`
- Latest key runs at commit `5af8289d9f83d3813cc070bd6548af90000b3b66`:
  - `Openpawl Action Smoke`: success, run `27331737141`
  - `CI`: success, run `27331705990`
  - `CodeQL`: success, run `27331704789`
  - `Publish to npm`: skipped for the marketplace-candidate tag path

Known Marketplace blocker from the final audit:

- `v0.5.1` release/tag URLs were not available during the audit.
- Do not claim Marketplace publication is complete until the final release/tag and GitHub listing are actually live.

### GitHub Marketplace Requirements That Affect The Website

GitHub's current action publishing docs state:

- The action must be in a public repository.
- The repository must contain a single root `action.yml` or `action.yaml` metadata file for the Marketplace listing.
- The action metadata `name` must be unique and valid.
- The publisher must accept Marketplace terms/developer agreement before publishing.
- Publishing happens through a GitHub release flow, where the action can be selected for Marketplace publication.

Website consequence:

- The website may say "Marketplace candidate" or "GitHub Action install guide" until the listing is live.
- The website must not say "available on GitHub Marketplace" until the listing URL exists and is verified.
- Marketplace listing support/install/docs/status/privacy/terms URLs should be stable before submission.

### Positioning Problems

1. Homepage over-broadness

The current homepage claims CodePawl builds "AI agent products for teams building production platforms" and "debugging, memory, coordination, and optimization infrastructure." That is directionally accurate for the roadmap but too broad for the current public surface.

2. Product hierarchy is inverted

The current product catalog marks TracePawl as the current focus and OpenPawl as one of several products. For Marketplace readiness, Openpawl should be the public entry product and proof point. CodePawl Cloud should be upcoming. TracePawl/Mempawl/CachePawl should become future layers or architecture modules.

3. Readiness labels are ambiguous

`DEVELOPING` and `COMING SOON` do not communicate what a user can actually do today. Use clearer labels:

- `Available: GitHub Action/TUI`
- `Beta: guarded write mode`
- `Upcoming: cloud waitlist`
- `Roadmap layer`

4. Old repository references

Local CodePawl docs and website product data still point to `codepawl/codepawl`, while current public Openpawl action repo is `codepawl/openpawl`.

5. Marketplace-critical URLs are missing

The required stable URLs currently 404. This blocks using `codepawl.com` as a Marketplace support/legal/docs URL surface.

6. Legal pages are linked but absent

Footer links to `/privacy` and `/terms`; both are missing. This is a trust issue and a Marketplace issue.

7. Cloud is not framed

The site has Clerk auth, API, newsletter/contact, PostHog, and a Marketplace webhook, but no public cloud product page. If CodePawl Cloud is upcoming, the site needs a waitlist page that clearly says it is not generally available.

8. Internal deployment details are too easy to leak

`docs/OPS.md` contains concrete deployment/vendor/secret/runbook details. Do not surface these in public marketing pages. Public status pages should show service health, public links, and known limitations only.

## Product Architecture

### Public Product

Openpawl

- What it is today: a public TypeScript coding agent workspace plus a dry-run-first GitHub Action for repository review.
- Website claim: "Dry-run-first AI code review for GitHub Actions."
- Allowed claims:
  - Public source exists at `codepawl/openpawl`.
  - Root `action.yml` exists.
  - Dry-run is default.
  - Write mode is explicit and safety-gated.
  - Current beta writes are constrained and reviewed through bot branches/PRs.
  - CI, CodeQL, and root action smoke have passed on the candidate commit.
- Avoid:
  - "Autonomous code changes"
  - "Fully automated coding teammate"
  - "Available on GitHub Marketplace" until listing is live
  - Any claim that broad write support is ready

### Upcoming Cloud Layer

CodePawl Cloud

- What it should be described as: upcoming hosted evidence, run history, status, and team workflow layer for Openpawl and future CodePawl products.
- Website claim: "Join the waitlist for hosted run evidence, team review flows, and cloud-managed product surfaces."
- Required disclaimer: "CodePawl Cloud is not generally available yet."
- Avoid:
  - Pricing claims
  - Billing/account provisioning claims
  - Production SLA claims
  - Claims that customer repo code, prompts, traces, or artifacts are stored today unless implemented and documented publicly

### Future Layers

TracePawl

- Future layer for trace analysis, failure diagnosis, replay, and evidence.
- Present as roadmap or "in development", not as generally installable unless public package/repo status is confirmed.

Mempawl

- Future layer for persistent operational memory across agent runs.
- Present as "planned memory layer".

CachePawl

- Future layer for cost/latency optimization and repeat-run caching.
- Present as "planned optimization layer".

## New Route Map

Preserve all Marketplace-critical URLs:

- `/openpawl/install`
- `/openpawl/docs`
- `/openpawl/support`
- `/status`
- `/privacy`
- `/terms`

Recommended public route map:

| Route | Purpose | Readiness | Notes |
| --- | --- | --- | --- |
| `/` | CodePawl homepage | Rewrite | Lead with Openpawl now, CodePawl Cloud upcoming, future layers later. |
| `/openpawl` | Openpawl product landing | New canonical page | May redirect from `/products/openpawl` or keep both with canonical metadata. |
| `/openpawl/install` | Marketplace install guide | New required page | Copy from current public Openpawl repo docs, not stale monorepo docs. |
| `/openpawl/docs` | Product docs hub | New required page | Link to README, action metadata, install guide, security, examples. |
| `/openpawl/support` | Support page | New required page | Issues link, security advisory link, contact route, response expectations. |
| `/cloud` | CodePawl Cloud overview | New | Upcoming only. CTA to waitlist. |
| `/cloud/waitlist` | Cloud waitlist | New | Newsletter/contact-backed waitlist; no availability claim. |
| `/status` | Public status page | New required page | Link GitHub Actions, webhook health note, docs freshness, known limitations. |
| `/privacy` | Privacy policy | New required page | Cover website analytics, newsletter/contact, Marketplace webhook, cloud waitlist. |
| `/terms` | Terms | New required page | Cover website, self-managed Openpawl, upcoming Cloud waitlist disclaimers. |
| `/products` | Product architecture index | Keep, rewrite | Make it an architecture map, not a catalog of equally ready products. |
| `/products/openpawl` | Legacy/current product URL | Preserve | Either render Openpawl landing or redirect to `/openpawl`. |
| `/products/trace` | Future layer page | Keep, rewrite | "Roadmap layer", not install-ready unless verified. |
| `/products/mempawl` | Future layer page | Keep, rewrite | "Roadmap layer". |
| `/products/cachepawl` | Future layer page | Keep, rewrite | "Roadmap layer". |
| `/docs` | Docs index | Keep | Include Openpawl docs first; future layers can be roadmap placeholders. |
| `/docs/openpawl` | Existing docs URL | Keep | Redirect or canonicalize to `/openpawl/docs`. |
| `/contact` | Contact | Keep | Add support triage choices if useful. |
| `/pricing` | Pricing | Keep but soften | State Cloud pricing is not public yet; self-managed Openpawl is free/open source. |
| `/api/github/marketplace` | Marketplace webhook | Keep | POST-only, not in nav. |

Navigation proposal:

- Primary:
  - Openpawl
  - Cloud Waitlist
  - Docs
  - Status
  - Contact
- Secondary/footer:
  - Products
  - Future Layers
  - Research
  - Blog
  - Privacy
  - Terms
  - GitHub

Do not put "Sign in" and "Sign up" in the primary marketing nav until CodePawl Cloud has a useful signed-in product surface. If auth remains, label the area as waitlist/account preview or hide it from the first pass.

## Homepage Rewrite

### Target Position

CodePawl is the company behind Openpawl and the upcoming CodePawl Cloud.

### Hero Direction

H1:

`Openpawl is the public start. CodePawl Cloud is next.`

Alternative:

`Dry-run-first AI code review today. Cloud evidence workflows next.`

Support copy:

`Openpawl is a public GitHub Action and TypeScript coding-agent workspace for conservative repository review. CodePawl Cloud is the upcoming hosted layer for run evidence, team review flows, and future trace, memory, and cache products.`

Primary CTA:

- `Install Openpawl` -> `/openpawl/install`

Secondary CTA:

- `Join Cloud waitlist` -> `/cloud/waitlist`

Trust strip:

- `Public repo: codepawl/openpawl`
- `Dry-run default`
- `Root action smoke: passed`
- `Cloud: waitlist only`

### Homepage Sections

1. Hero: Openpawl now, Cloud next.
2. Current proof: public repo, action metadata, CI/CodeQL/smoke run evidence.
3. Openpawl workflow: install, dry-run review, artifacts, optional gated write.
4. CodePawl Cloud preview: hosted evidence, team workflows, run history, not available yet.
5. Future architecture layers: TracePawl, Mempawl, CachePawl as roadmap modules.
6. Marketplace safety/legal links: install, docs, support, status, privacy, terms.
7. Newsletter/waitlist CTA.

### Homepage Copy Guardrails

Use:

- "public GitHub Action"
- "dry-run-first"
- "explicit maintainer approval"
- "upcoming hosted layer"
- "waitlist"
- "roadmap layer"

Avoid:

- "production platform" as the dominant headline
- "autonomous writes"
- "self-driving engineering"
- "cloud available now"
- "pricing plans" unless real
- "stores/replays customer code" unless implemented and covered by privacy/terms

## Openpawl Landing Page Rewrite

Canonical route: `/openpawl`

Purpose:

- Give Marketplace reviewers and users a public, stable, accurate product page.

Hero:

`Openpawl`

Subhead:

`Dry-run-first AI code review for GitHub issues and pull requests.`

Body:

`Openpawl runs from GitHub Actions, reviews repository context, writes schema-versioned artifacts, and keeps write mode behind explicit maintainer-controlled gates. The default path is review-only.`

Core sections:

- What it does today
  - Runs dry-run reviews from GitHub Actions.
  - Emits `report.md`, `trace.json`, `run.json`, `patch-plan.json`, `selected-files.json`, and `applied-files.json`.
  - Posts report context to issues/PRs when configured.
  - Supports explicit, safety-gated write mode for constrained beta tasks.
- Safety model
  - Dry-run by default.
  - Exact commands only.
  - Forked PR comments skipped.
  - Bot-authored comments ignored.
  - Approved writes create bot branches and PRs.
- Evidence
  - Repo: `https://github.com/codepawl/openpawl`
  - CI run `27331705990`: success
  - CodeQL run `27331704789`: success
  - Root action smoke `27331737141`: success
- Install
  - Link to `/openpawl/install`
  - Show `uses: codepawl/openpawl@<verified-release>` only after release exists.
  - Before release exists, say candidate install docs are pending final release.
- Limitations
  - Current beta write mode is narrow.
  - Cloud is not required.
  - Marketplace publication status must match reality.

SEO:

- Title: `Openpawl by CodePawl - Dry-run-first AI code review`
- Description: `Openpawl is a public GitHub Action and TypeScript coding-agent workspace for conservative repository review, schema-versioned artifacts, and explicit write-mode gates.`
- Canonical: `https://codepawl.com/openpawl`

## Cloud Waitlist Page

Canonical route: `/cloud/waitlist`

Page claim:

`CodePawl Cloud is upcoming. Join the waitlist.`

Copy:

`CodePawl Cloud will host the evidence and collaboration layer around Openpawl and future CodePawl products. It is not generally available yet. Joining the waitlist helps prioritize early access for teams that need run history, evidence review, and team workflow support.`

Form fields:

- Email
- Name optional
- Company/team optional
- GitHub org optional
- Primary interest:
  - Openpawl Action
  - Run evidence
  - Team review workflows
  - Trace/replay
  - Memory/caching
- Consent checkbox:
  - `Email me about CodePawl Cloud early access and product updates.`

Implementation note:

- Reuse newsletter/contact infrastructure if possible, but tag the source as `cloud_waitlist`.
- Do not create billing, provisioning, or account activation copy.
- Do not promise a launch date.

## Marketplace Support/Install/Docs/Status/Legal Pages

### `/openpawl/install`

Must include:

- Short install status banner:
  - If release is not live: `Marketplace release is pending; use this page for candidate install instructions only.`
  - If release is live: `Install from the verified release tag.`
- Minimal workflow example.
- Permissions.
- Config file.
- Dry-run default.
- Write-mode limitations.
- Artifact list.
- Links:
  - GitHub repo
  - action metadata
  - sample config
  - support
  - security advisories

### `/openpawl/docs`

Must include:

- README link.
- Action inputs/outputs summary.
- Artifact contract.
- Trigger commands.
- Safety model.
- Troubleshooting.
- Link to public docs in `codepawl/openpawl`.

### `/openpawl/support`

Must include:

- General support: `https://github.com/codepawl/openpawl/issues`
- Security: `https://github.com/codepawl/openpawl/security/advisories`
- Website/contact: `/contact`
- Expected response framing without overpromising:
  - "Best effort for public beta."
  - "Security reports handled privately."

### `/status`

Must include:

- Public source/status links:
  - Openpawl repo.
  - CI workflow.
  - CodeQL workflow.
  - Action smoke workflow.
  - Marketplace webhook status as "endpoint live; POST-only".
- Public limitations:
  - Marketplace release/listing status.
  - Cloud waitlist status.
  - Docs sync status.
- Do not expose:
  - Hosting provider versions or internal runtime identifiers.
  - Database, deployment, or rollback internals.
  - Secret names beyond public integration names.
  - Internal deployment runbooks.

### `/privacy`

Must cover:

- Website analytics via PostHog.
- Newsletter/waitlist email collection and double opt-in.
- Contact form storage and reply handling.
- GitHub Marketplace webhook event handling.
- Openpawl self-managed action data boundary:
  - The self-managed GitHub Action writes artifacts in the user's repository/workflow context.
  - CodePawl website should not claim to receive repo code/traces unless Cloud features later do so.
- Cloud waitlist:
  - Email and submitted metadata only.
- Retention/deletion contact.
- Third parties:
  - GitHub
  - Cloudflare
  - PostHog
  - Resend/email provider
  - Authentication provider if sign-in stays public

### `/terms`

Must cover:

- Website use.
- Self-managed Openpawl is provided via its repo/license, not as a hosted managed service.
- CodePawl Cloud is upcoming/waitlist only.
- No warranty/SLA for beta/self-managed workflows.
- User responsibility for reviewing AI-generated output.
- Security reports through private channel.

## Visual Direction

Keep the existing brand style unless implementation finds concrete usability failures. The current visual language is distinctive and consistent:

- Warm concrete neutrals.
- Sharp rectangular geometry.
- Heavy borders and block shadows.
- Ratchet accent.
- Fraunces display + Inter Tight body + JetBrains Mono captions/code.
- Architectural/grid overlays.

Recommended changes:

- Keep the industrial/architectural style.
- Reduce generic product-card density on the homepage.
- Use stronger hierarchy:
  - Openpawl: solid active product treatment.
  - CodePawl Cloud: outlined "upcoming" treatment.
  - Trace/Mem/Cache: blueprint/roadmap layer treatment.
- Replace `DEVELOPING` with more literal labels.
- Add small evidence/status modules instead of broad claims.
- Avoid adding decorative gradients, bokeh, or soft SaaS hero treatments that would dilute the brand.
- Ensure legal/status pages use restrained document layouts, not marketing-heavy panels.

## SEO And Metadata Updates

Global metadata:

- Site title: `CodePawl - Openpawl and upcoming cloud workflows for AI code review`
- Site description: `CodePawl builds Openpawl, a dry-run-first GitHub Action for AI-assisted repository review, and the upcoming CodePawl Cloud evidence layer.`

Page metadata:

- `/`: `CodePawl - Openpawl now, CodePawl Cloud next`
- `/openpawl`: `Openpawl by CodePawl - Dry-run-first AI code review`
- `/openpawl/install`: `Install Openpawl - GitHub Action setup`
- `/openpawl/docs`: `Openpawl Docs - Inputs, artifacts, and safety gates`
- `/openpawl/support`: `Openpawl Support - Issues and security reports`
- `/cloud/waitlist`: `CodePawl Cloud Waitlist`
- `/status`: `CodePawl Status`
- `/privacy`: `CodePawl Privacy Policy`
- `/terms`: `CodePawl Terms`

Technical SEO:

- Add canonical URLs for `/openpawl` and `/docs/openpawl` to avoid duplicate docs/product content.
- Add Open Graph title/description per key page.
- Add `robots` defaults allowing public pages.
- Add JSON-LD only if it does not overclaim product availability.
- Avoid "Marketplace" in page titles until listing is live; use "GitHub Action" instead.

## Analytics, Newsletter, And Contact Requirements

Analytics:

- Keep PostHog page view capture.
- Confirm session recording stays disabled unless privacy policy is updated.
- Track only high-level conversion events:
  - `openpawl_install_click`
  - `openpawl_docs_click`
  - `cloud_waitlist_submit`
  - `contact_submit`
  - `newsletter_subscribe_submit`
- Do not capture repository names, issue bodies, prompts, traces, or artifact contents in analytics.

Newsletter/waitlist:

- Preserve double opt-in.
- Add a `source` value for each form:
  - `footer_newsletter`
  - `cloud_waitlist`
  - `openpawl_updates`
- Make unsubscribe and privacy links visible near signup copy.

Contact:

- Keep `/contact`.
- Add support-oriented routing copy:
  - Openpawl bug/support -> GitHub Issues.
  - Security -> GitHub private advisory.
  - Partnerships/cloud waitlist -> contact form.
- Keep Turnstile or equivalent anti-abuse protection.

## Phased Implementation Checkpoints

### Phase 0: Freeze Claims

Goal:

- Stop overclaiming before changing layouts.

Tasks:

- Update source-of-truth copy table for Openpawl, CodePawl Cloud, TracePawl, Mempawl, CachePawl.
- Confirm current Openpawl release/listing status.
- Confirm whether `v0.5.1` exists before using it in install snippets.

Go/no-go:

- Go only if all public copy labels product readiness accurately.
- No-go if the site still says Marketplace is live before listing is live.

### Phase 1: Marketplace-Critical Routes

Goal:

- Make required support/install/docs/status/legal URLs return `200`.

Tasks:

- Add `/openpawl/install`.
- Add `/openpawl/docs`.
- Add `/openpawl/support`.
- Add `/status`.
- Add `/privacy`.
- Add `/terms`.
- Preserve footer legal links.
- Add route tests and live status checks.

Go/no-go:

- Go if all six required URLs return `200` locally and in preview.
- No-go if any required URL 404s or exposes internal deployment details.

### Phase 2: Openpawl Canonical Surface

Goal:

- Make Openpawl the current public proof point.

Tasks:

- Add `/openpawl`.
- Update `/products/openpawl` to redirect or canonicalize to `/openpawl`.
- Update stale `codepawl/codepawl` references to `codepawl/openpawl` where they describe the public action.
- Add evidence cards for CI, CodeQL, and smoke run.

Go/no-go:

- Go if public Openpawl page is accurate and source links work.
- No-go if it claims unsupported write behavior or nonexistent release/listing.

### Phase 3: Homepage Repositioning

Goal:

- Rewrite homepage around current/future architecture.

Tasks:

- Replace broad production-platform hero with Openpawl-now/Cloud-next copy.
- Add Cloud waitlist CTA.
- Move TracePawl/Mempawl/CachePawl into future layers section.
- Preserve existing visual style with clearer readiness labels.

Go/no-go:

- Go if a first-time visitor can answer:
  - What can I use today?
  - What is coming later?
  - Where do I install/support/docs/legal?
- No-go if Cloud appears available.

### Phase 4: Cloud Waitlist

Goal:

- Create an approval-safe Cloud waitlist path.

Tasks:

- Add `/cloud`.
- Add `/cloud/waitlist`.
- Reuse newsletter/contact backend with source tagging or add minimal waitlist handling.
- Add privacy/terms references.
- Track waitlist submit event.

Go/no-go:

- Go if waitlist records consent and does not imply product access.
- No-go if billing/provisioning/private cloud details leak.

### Phase 5: Validation And Launch

Goal:

- Verify routing, metadata, content claims, and forms.

Tasks:

- Run local typecheck/lint/tests.
- Run Playwright on critical public routes.
- Run live preview smoke before production.
- Review with Marketplace checklist.

Go/no-go:

- Go if all required URLs are stable, legal pages are present, and Openpawl status matches GitHub reality.
- No-go if Marketplace listing fields point to missing URLs.

## Validation Commands

Local static checks:

```bash
bun --filter @codepawl/web typecheck
bun --filter @codepawl/web lint
bun --filter @codepawl/web test
```

Build:

```bash
bun --filter @codepawl/web build
```

E2E:

```bash
bun --filter @codepawl/web test:e2e
```

Route status smoke against local/preview:

```bash
BASE_URL=http://localhost:3000
for path in \
  / \
  /openpawl \
  /openpawl/install \
  /openpawl/docs \
  /openpawl/support \
  /cloud/waitlist \
  /status \
  /privacy \
  /terms \
  /contact
do
  curl -fsS -o /dev/null -w "%{http_code} ${path}\n" "${BASE_URL}${path}"
done
```

Public Openpawl evidence checks:

```bash
gh repo view codepawl/openpawl --json nameWithOwner,visibility,isPrivate,url,defaultBranchRef
gh api 'repos/codepawl/openpawl/contents/action.yml?ref=main' --jq .download_url
gh run list --repo codepawl/openpawl --limit 5 --json databaseId,workflowName,status,conclusion,headSha,createdAt,url
```

Marketplace URL checks after production deploy:

```bash
for path in \
  /openpawl/install \
  /openpawl/docs \
  /openpawl/support \
  /status \
  /privacy \
  /terms
do
  curl -fsS -o /dev/null -w "%{http_code} https://codepawl.com${path}\n" "https://codepawl.com${path}"
done
```

Webhook sanity:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://codepawl.com/api/github/marketplace
```

Expected GET result is `405`.

## Go/No-Go Criteria

Go for implementation when:

- The team accepts Openpawl as the primary current product surface.
- CodePawl Cloud is approved as "upcoming/waitlist only".
- Marketplace-critical route list is approved.
- Privacy/terms content scope is approved.
- Public Openpawl release/listing status is checked immediately before implementation.

Go for production deployment when:

- Required URLs return `200`.
- `/api/github/marketplace` still returns `405` for GET and valid POST handling is not regressed.
- No public page claims CodePawl Cloud is available.
- No public page claims autonomous broad writes.
- No page links Marketplace install snippets to a nonexistent release tag.
- Footer legal links work.
- Openpawl public repo links point to `codepawl/openpawl`.
- Analytics and forms do not capture sensitive repo/prompt/artifact data.

No-go if:

- `/privacy` or `/terms` is missing.
- `/openpawl/install`, `/openpawl/docs`, `/openpawl/support`, or `/status` returns 404.
- Cloud page implies billing, provisioning, SLA, or hosted availability.
- Openpawl page claims Marketplace publication before the listing URL exists.
- Any public page exposes private cloud/deployment/billing/internal operational details from `docs/OPS.md`.
- Release/tag references are not verified.

## Risks

1. Release/tag drift

The website install snippets can become incorrect if they name a release tag before that tag exists. Mitigation: block release-specific snippets until the final Openpawl tag and Marketplace listing URL are verified.

2. Marketplace status drift

The CodePawl monorepo docs still describe a workflow-only Marketplace blocker, while the public `codepawl/openpawl` repository now has a root action wrapper. Mitigation: treat `codepawl/openpawl` as the current public source of truth for website copy and update monorepo docs separately.

3. Cloud overclaiming

Clerk, newsletter, contact, API, and webhook infrastructure can make the site look like a live SaaS before CodePawl Cloud is actually available. Mitigation: label all Cloud surfaces as waitlist/upcoming and hide or soften sign-in CTAs until there is a real product journey.

4. Legal readiness

Footer legal links currently 404. Mitigation: implement `/privacy` and `/terms` before any Marketplace submission or homepage relaunch.

5. Internal detail leakage

`docs/OPS.md` contains operational details that should not be copied into public status/legal/marketing pages. Mitigation: public pages should summarize service purpose, data boundaries, and support routes without provider-specific runbook or deployment data.

6. Product architecture confusion

TracePawl, Mempawl, and CachePawl can distract from the one product users can use now. Mitigation: present them as future layers under the CodePawl architecture, with Openpawl as the current public proof point.

## Open Questions Before Website Code Edits

- Should `/products/openpawl` redirect to `/openpawl`, or render the same component with canonical metadata?
- Should `/docs/openpawl` redirect to `/openpawl/docs`, or remain a docs-shell route with canonical metadata?
- What email should appear on privacy/terms pages: `founder@codepawl.com`, `hello@codepawl.com`, or a dedicated legal/support alias?
- Should Clerk sign-in/sign-up be hidden until CodePawl Cloud has an actual signed-in user journey?
- Is the Marketplace listing intended to use `codepawl.com` URLs or direct `github.com/codepawl/openpawl` URLs for the first submission?
- What is the exact release tag that install snippets should use after the npm-publish/tag conflict is resolved?
