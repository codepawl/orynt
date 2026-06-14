# CodePawl References Policy

Reference material helps CodePawl study design patterns, but reference material is not training data by default.

## Manual Style Study Only

- Public websites, product pages, design galleries, and portfolios may be reviewed manually to understand broad design patterns.
- Notes must describe abstract patterns such as hierarchy, rhythm, density, contrast, navigation structure, and interaction feel.
- Notes must not copy exact layouts, assets, copywriting, screenshots, illustrations, iconography, logos, or proprietary component compositions.

## No Bulk Scraping By Default

- Do not run crawlers, gallery downloaders, screenshot harvesters, or bulk capture scripts against public sites by default.
- Do not automate collection from Behance, Dribbble, product marketing sites, app dashboards, or brand pages without explicit approval and a documented legal basis.
- Any future bulk collection proposal must include source permissions, rate limits, robots.txt review, license review, and an exclusion/removal process.

## No Screenshot Redistribution By Default

- Do not commit third-party screenshots, brand pages, logos, product captures, gallery images, or creator portfolio images.
- Do not include third-party screenshots in PawlBench releases, papers, public reports, or model cards unless explicit permission allows redistribution.
- Use self-authored diagrams or synthetic examples when a report needs visual examples.

## No Training Without Explicit Permission

- Do not train Pawl-JEPA or any baseline on brand, creator, gallery, portfolio, or product screenshots without explicit permission.
- Do not infer permission from public availability.
- Do not mix private reference notes into training manifests.

## Style Notes Rules

- Style notes should stay high level and abstract.
- Style notes may describe patterns, tradeoffs, and taxonomy tags.
- Style notes must not contain copied screenshots, image URLs for dataset use, exact page sections, proprietary text, or reverse-engineered design tokens.
- Style notes must include a "what CodePawl must not copy" section.

## Separation Of Concerns

- `references/style_notes/` is for private manual study notes and templates.
- `examples/` is for self-controlled HTML examples.
- `artifacts/` is for generated local outputs.
- Any future training manifest must explicitly exclude private reference notes unless a maintainer approves a specific, policy-compliant transformation.
