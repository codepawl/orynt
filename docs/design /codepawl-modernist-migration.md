# CodePawl Modernist Landing Migration

## Goal

Migrate the visual direction from the Gemini/Open Design prototype into the real CodePawl website while keeping the existing repository content and backend/data flow as the source of truth.

The prototype is a visual reference only. It is not production architecture.

## Visual Direction

Vietnamese Modernist Architecture x restrained Brutalist Web.

Use:

* warm off-white background
* concrete gray panels
* charcoal text and borders
* one restrained accent color
* hard grid
* visible borders
* facade-inspired modules
* ventilation-brick, louver, column, and overhang motifs
* editorial hierarchy
* generous whitespace
* minimal motion

Avoid:

* clutter
* overlapping elements
* fake futuristic UI
* generic AI SaaS gradients
* glassmorphism
* 3D blobs
* decorative motifs behind body text
* chaotic brutalist layout

## Source of Truth

Use existing repository content and backend/data sources for:

* project names
* project descriptions
* project status
* links
* docs
* changelog
* evidence
* routes
* metadata
* CTA targets

Do not use invented prototype claims.

## Prototype Elements to Keep

Keep as visual inspiration:

* color mood
* hard borders
* editorial header
* architectural card rhythm
* facade grid patterns
* concrete panel feel
* responsive section structure
* CSS/SVG motif approach

## Prototype Elements to Reject

Do not migrate:

* Gemini API route
* Gemini dependency
* interactive workload synthesis
* fake latency metrics
* “72% latency reduction”
* “thermal routing optimization”
* “Kiến Trúc Nhân”
* “Concrete-Core AI Agent Runtimes”
* fake generated YAML
* fake infrastructure claims
* fake production maturity

## Target Page Structure

1. Hero

   * Product name
   * concise positioning
   * primary CTA
   * secondary CTA
   * real status metadata if available

2. Problem

   * why AI agent infrastructure needs tracing, memory, reproducibility, and runtime efficiency

3. Project Ecosystem

   * CachePawl
   * TracePawl
   * MemPawl
   * TrainPawl
   * use real descriptions and links from repo/backend

4. Architecture / Features

   * map real capabilities into modular architectural blocks

5. Evidence

   * GitHub repos
   * docs
   * papers
   * demos
   * benchmarks
   * changelog
   * only if real

6. Roadmap / Status

   * active
   * experimental
   * planned
   * research
   * use real status values or TODO

7. Footer

   * GitHub
   * docs
   * contact
   * ecosystem links

## Component Plan

Create reusable components:

* SectionHeader
* BrutalCard
* ProjectCard
* StatusTag
* EvidenceRow
* FacadeGrid
* ArchitecturePanel
* RoadmapBlock
* CTAGroup
* FooterLinks

## Responsive Rules

Desktop:

* editorial two-column layouts are allowed
* architectural visuals may sit beside text

Tablet:

* reduce decorative density
* keep cards readable
* avoid cramped two-column content

Mobile:

* single-column layout
* hide or simplify heavy architectural motifs
* keep CTAs visible
* no horizontal overflow
* no text over complex visuals

## Verification

Run available checks:

* formatter
* linter
* typecheck
* tests
* build

Also manually check:

* desktop layout
* tablet layout
* mobile layout
* no overlapping text/cards/buttons
* accessible contrast
* real content only
