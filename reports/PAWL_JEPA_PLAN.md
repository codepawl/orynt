# Pawl-JEPA Plan

## Hypothesis

Frontend UI quality can be represented more usefully when a model learns from rendered evidence instead of source code alone. Screenshots, DOM structure, accessibility trees, layout metrics, and controlled UI perturbations should provide enough signal for a JEPA-style representation model to support design critique and generation feedback.

Any future training data must comply with `docs/DATA_POLICY.md`. Public websites, design galleries, brand pages, and creator portfolios may be used for private manual style study only under `docs/REFERENCES_POLICY.md`; they are not Pawl-JEPA training data by default.

## What Pawl-JEPA Does

- learns representations of frontend UI states from local render artifacts
- compares original and perturbed UI examples
- supports critique tasks such as visual hierarchy, spacing, accessibility, and layout consistency
- produces embeddings or scores that can be evaluated inside PawlBench Design

## What Pawl-JEPA Does Not Do

- it does not replace the product UI
- it does not train in this scaffold
- it does not provide hosted inference
- it does not require auth, billing, databases, or cloud deployment
- it does not generate production frontend code by itself

## Minimum Success Gates

- A local render harness can create reproducible artifact folders for static HTML.
- Artifacts include screenshot, DOM, accessibility, and metrics data.
- PawlBench Design defines at least one repeatable benchmark task using those artifacts.
- Simple baselines are measured before training starts.
- Jitter pairs show measurable differences on known UI perturbations.
- Data provenance and release constraints are documented before dataset scaling.
- A microtraining run beats at least one simple baseline on a narrow benchmark task.

## Staged Plan

1. Data harness: implement `codepawl-render` with Playwright and write local artifacts.
2. Baselines: compute simple metrics and compare trivial embedding or rules-based approaches.
3. Jitter pairs: generate controlled UI variants for spacing, typography, contrast, hierarchy, and responsiveness.
4. Data governance: maintain data policy, reference policy, and style taxonomy before scaling local datasets.
5. Microtrain: train the smallest Pawl-JEPA experiment against one narrow task.
6. Generation loop: use Pawl-JEPA and PawlBench Design results to guide CodePawl Design generation and critique workflows.
