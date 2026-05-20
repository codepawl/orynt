# Scope

## In scope (MVP)

- **Marketing site shell.** Nav, footer, dark mode default, sticky header, sharp-corner design system.
- **Landing page** with hero (auto-cycling 6-product showcase), formats section, features grid, SDK demo, pricing teaser, testimonials, final CTA.
- **Six product pages** under `/products/[slug]` for OpenPawl, Featcat, HebbMem, TurboQuant, Cachepawl, KStudio. Each pulls live GitHub stats.
- **Research page** at `/research` listing curated AI/ML papers and short notes. MDX-authored.
- **Docs page** at `/docs` rendering MDX from internal product repos via GitHub API (deferred until phase 6).
- **Blog** at `/blog/[slug]` MDX with custom components (code block, repo card, KaTeX, YouTube embed).
- **Careers page** at `/careers` listing open roles. MDX files per role.
- **Pricing page** at `/pricing` static, three tiers, no real billing in MVP.
- **Newsletter signup** with double opt-in via Resend, Turnstile-protected.
- **Contact form** at `/contact` Turnstile-protected, forwards to hello@codepawl.com.
- **GitHub stats sync** background job pulling stars, forks, last release for the six products every 6 hours.
- **Sitemap, robots.txt, RSS feed** generated at build time.
- **Analytics** PostHog page views and one conversion event (newsletter confirm).
- **Error tracking** Sentry on both web and API.

## Out of scope (deferred)

These have explicit revisit triggers. Until then, do not build.

- **Community forum.** Revisit when: 500+ newsletter subscribers active, or when DAU on landing exceeds 100 sustained for 4 weeks.
- **Paper reproduction system (Reproduce and Verify).** Revisit when: research page hits 20+ MDX entries and 3+ contributors outside the founder.
- **Challenge Hub aggregator.** Revisit when: we have a clear partnership signal (one competition host reaches out, or 100 users explicitly request it).
- **Search across blog, news, papers.** Revisit when: blog hits 30+ posts. Until then, manual browsing is fine.
- **Real billing on pricing page.** Revisit when: first paying customer requests it. Stripe integration is a separate phase.
- **User accounts on marketing site.** Auth lives in the `(app)` route group only. Marketing reads no user state.
- **Comments on blog or research pages.** Use GitHub Discussions per repo, or a Discord link.
- **Multi-language site (Vietnamese version).** Revisit when: 1000+ Vietnamese visitors per month per PostHog geo data.
- **AI-powered features in the site itself** (chatbot, "related posts," semantic search). The site is about the products, not a demo of them.
- **Mobile app.** The site is responsive. No native app in 2026.

## Non-goals

- Not building a competitor to Discord, Slack, or Twitter
- Not building a paper management tool (Zotero competitor)
- Not aggregating every AI/ML repo on GitHub (this is curated, not exhaustive)
- Not running ads
- Not selling user data, not running affiliate spam

## Revisit triggers

Run a scope review when any of these hit:

- Monthly active visitors crosses 5000
- Newsletter subscribers cross 500
- One open-source product crosses 1000 GitHub stars
- A paying customer asks for a feature
- A second engineer joins the team
