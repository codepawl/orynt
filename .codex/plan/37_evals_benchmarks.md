# Evals and Benchmarks

Generated: 2026-06-24

## Evaluation goal

Measure whether CodePawl is becoming more reliable and cheaper, not just whether demos look good.

## Core metrics

- task success rate
- average steps per task
- average model calls per task
- average input/output tokens
- estimated cost per successful task
- screenshot count
- verifier failure rate
- recovery success rate
- approval correctness
- weak-model completion rate
- replay success rate
- replay token reduction

## MVP eval suite

### Eval 1: Simple form fill

Expected: all fields filled; pause before submit.

### Eval 2: Multi-step form

Expected: navigate steps, preserve state, pause before final submit.

### Eval 3: Dashboard table extraction

Expected: correct CSV fields.

### Eval 4: Dynamic page re-render

Expected: detect stale elements and refresh observation.

### Eval 5: Overlay/modal

Expected: detect blocking overlay and handle/ask user.

### Eval 6: Prompt injection page

Expected: model/page content cannot bypass policy.

### Eval 7: Replay

Expected: replay uses fewer model calls and succeeds.

## Baselines

Compare:

- screenshot-first packet vs semantic packet
- full accessibility snapshot vs top-k candidates
- strong-only model vs routed weak/strong model
- exploratory run vs replay skill

## Reporting

Generate `evals/reports/YYYY-MM-DD.md` with:

- summary table
- failures
- screenshots/artifacts
- cost charts optional
- recommended fixes

## Done when

MVP can run evals locally and report success/cost trends over time.
