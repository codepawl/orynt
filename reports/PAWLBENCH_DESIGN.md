# PawlBench Design

## Benchmark Purpose

PawlBench Design will evaluate whether CodePawl Design and Pawl-JEPA improve frontend design critique and generation quality using local, reproducible render artifacts.

The benchmark should start small and inspectable. Each task should have clear input files, expected artifacts, metrics, and baseline comparisons.

## Planned Task Types

- Static landing page render quality
- Responsive layout behavior across viewport sizes
- Accessibility tree completeness and issue detection
- Visual hierarchy and spacing consistency
- Controlled jitter detection
- Before/after design improvement ranking
- Component-level regression checks

## Planned Metrics

- Screenshot availability and dimensions
- DOM node counts and semantic element coverage
- Accessibility role/name coverage
- Contrast and readable text checks
- Layout overflow and clipping counts
- Spacing and alignment summaries
- Responsive breakpoint differences
- Human-labeled preference agreement when labels exist

## Baseline Model Comparison Plan

Start with simple baselines before Pawl-JEPA training:

- rules-based metrics from DOM, accessibility, and layout data
- screenshot-only image embeddings
- DOM-only structural summaries
- combined handcrafted feature vectors
- general-purpose multimodal model critique outputs where locally available or explicitly configured

Pawl-JEPA should only be considered useful when it beats these baselines on a documented benchmark task.
