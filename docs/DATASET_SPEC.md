# UI-JEPA Dataset Spec

Source plan: `docs/ui_jepa_dataset_model_plan.md`.  
Status: v0 smoke specification with Phase 0.5 benchmark sanity fixes. The repository now implements a canonical local `ui_jepa_v0_smoke` JSONL dataset builder with optional Parquet export when `pandas` and `pyarrow` are installed. Large mixed-source ingestion remains future work.

## Dataset Targets

### `ui_jepa_v0_smoke`

- Purpose: validate loader, render artifacts, region extraction, corruption rendering, splits, and baseline reports.
- Minimum scale: 5K-10K screens when external/public datasets are admitted.
- Current local substitute: `examples/local_v1` rendered with 8 deterministic corruption seeds per base page. The current generated corpus has 990 screens and 2162 preference pairs.
- Output root: `data/processed/ui_jepa_v0_smoke` by default.

### `ui_jepa_v0_pilot`

- Purpose: decide whether UI-JEPA beats frozen baselines.
- Minimum scale: 50K-100K screens and 100K+ preference pairs.
- Not started.

### `ui_loop_v0`

- Purpose: validate the practical frontend loop from local critique to patch instruction, deterministic patch/manual artifact, rerender, and before/after scoring.
- Current sets: `loop_easy_20`, `loop_mixed_50`, and `loop_hard_100`.
- Current source: local `ui_jepa_v0_smoke` original-vs-corrupted pairs.
- Output root: `data/processed/ui_loop_v0`.
- Label provenance: synthetic/local.

## Canonical Layout

```text
data/processed/ui_jepa_v0_smoke/
  manifest.jsonl
  splits.json
  regions.jsonl
  pairs.jsonl
  design_tokens.jsonl
  critiques.jsonl
  images/
  dom/
  accessibility/
  masks/
  tokens/
  validation.json
```

Closed-loop layout:

```text
data/processed/ui_loop_v0/
  loop_easy_20/
    tasks.jsonl
    summary.json
  loop_mixed_50/
    tasks.jsonl
    summary.json
  loop_hard_100/
    tasks.jsonl
    summary.json
```

Parquet equivalents should use the same field names when introduced:

```text
manifest.parquet
splits.parquet
regions.parquet
pairs.parquet
critiques.parquet
```

## Screen Manifest Schema

One row per screen/render.

Required fields:

```text
schema_version: ui_jepa_manifest_v1
sample_id: string
source_dataset: websight | webui | webcode2m | rico | mobileviews | uicrit | internal
platform: web_desktop | web_mobile | android | ios | unknown
screenshot_path: string
width: int
height: int
dpr: float | null
viewport_width: int | null
viewport_height: int | null
source_url_hash: string | null
domain_hash: string | null
app_id_hash: string | null
page_type: landing | dashboard | auth | settings | pricing | docs | ecommerce | feed | form | table | unknown
html_path: string | null
css_path: string | null
dom_path: string | null
accessibility_tree_path: string | null
view_hierarchy_path: string | null
ocr_path: string | null
region_manifest_path: string | null
design_tokens_path: string | null
license_tag: string | null
quality_filter_score: float
is_synthetic: bool
is_corrupted: bool
parent_sample_id: string | null
split_group_id: string
created_at: timestamp
```

Current implementation: `uv run ui-jepa-smoke-build --source examples/local_v1 --out data/processed/ui_jepa_v0_smoke --seed 42` emits canonical smoke fields (`screen_id`, artifact paths, viewport, split group, `render_hash`, and schema metadata) from local rendered originals and deterministic corruptions.

## Region Schema

One row per semantic region/component group.

```text
schema_version: ui_jepa_region_v1
sample_id: string
region_id: string
parent_region_id: string | null
region_type: string
bbox_x1: float
bbox_y1: float
bbox_x2: float
bbox_y2: float
area_ratio: float
patch_ids: list[int]
text_density: float
interactive_density: float
children_count: int
source: dom | accessibility_tree | view_hierarchy | heuristic | cv_fallback
confidence: float
```

Region extraction order:

1. Semantic HTML and ARIA roles.
2. DOM groups and CSS layout containers.
3. Repeated component pattern detection.
4. Mobile view hierarchy groups.
5. OCR plus connected component fallback.

Initial region types:

```text
navbar, hero, sidebar, footer, form, search_box, card, card_grid,
pricing_table, table, chart, modal, toast, cta_group, text_block,
image_block, whitespace_block
```

## Design Tokens Schema

One JSON object per sample at `tokens/{sample_id}.design_tokens.json`.

Required top-level keys:

```text
colors
typography
spacing
shape
layout
```

Minimum required values:

```text
colors.background: list[string]
colors.text: list[string]
colors.accent: list[string]
colors.contrast_warnings: int
typography.font_families: list[string]
typography.font_sizes_px: list[float]
typography.heading_scale_ratio: float | null
spacing.dominant_gaps_px: list[float]
spacing.spacing_consistency_score: float | null
shape.radius_px: list[float]
shape.shadow_levels: int | null
layout.grid_detected: bool
layout.density_score: float | null
layout.alignment_score: float | null
```

## Pair Schema

One row per preference, contrastive, or retrieval pair.

```text
schema_version: ui_jepa_pair_v1
pair_id: string
left_sample_id: string
right_sample_id: string
preferred_sample_id: string | null
pair_type: good_corrupt | human_pref | same_template | same_page_responsive | same_app_flow | negative_random
preference_source: synthetic | human | designer | llm_pseudo | heuristic
confidence: float
issue_labels: list[string]
severity: float | null
split: train | val | test
split_group_id: string
```

Leakage rule: original, corruptions, responsive siblings, and same-template variants must share the same `split_group_id`.

Phase 0.5 smoke pair records additionally include:

```text
left_is_preferred: bool
orientation_seed: int
pair_family: original_vs_corrupted | low_severity_vs_high_severity | variant_vs_variant_same_corruption | variant_vs_variant_mixed_corruption
difficulty: hard | medium | easy
corruption_type: string
severity: float
```

`left_screen_id` and `right_screen_id` are oriented after split assignment with a fixed seed so always-left and always-right baselines remain near chance per split. Validation fails non-tiny splits when `best_constant_accuracy` exceeds `0.65`.

## Closed-Loop Task Schema

One row per local closed-loop task at `data/processed/ui_loop_v0/<set>/tasks.jsonl`.

Required fields:

```text
schema_version: ui_loop_v0_task_v1
task_id: string
base_screen_id: string
before_screen_id: string
source_path: string
clean_source_path: string
before_html_path: string
before_screenshot_path: string
before_dom_path: string
before_accessibility_path: string
before_metrics_path: string
known_issue_types: list[string]
expected_issue_types: list[string]
corruption_type: spacing | contrast | alignment | hierarchy
severity: float
difficulty: easy | medium | hard
split: train | val | test
expected_patch_scope: object
patch_mode_allowed: list[no_op | instruction_only | deterministic_patch | oracle_patch | manual_patch | manual_patch_import]
is_oracle_eligible: bool
has_clean_original_reference: bool
provenance_safe_for_non_oracle: bool
train_template_overlap: bool
critic_train_overlap: bool
holdout_status: train_template_overlap | holdout_template
pair_family: string
split_group: string
pair_id: string
```

The v0 deterministic patcher is intentionally conservative: it only edits copied loop work artifacts and removes known local CodePawl jitter style blocks. `oracle_patch` may copy the clean source version but must be marked as oracle upper-bound evidence and excluded from non-oracle claims. `manual_patch_import` reads manually produced artifacts from `data/manual_patches/ui_loop_v0/<task_id>/`; missing manual artifacts are skipped.

Aggregate reports separate `no_op_success_rate`, `deterministic_non_oracle_success_rate`, `oracle_upper_bound_success_rate`, `manual_patch_success_rate`, non-oracle/oracle critic deltas, and non-oracle accessibility/responsive regression rates. Mixed/hard pass flags use non-oracle evidence only.

## Corruption Operators

Required first operators:

- `spacing_jitter`: margin/padding/gap perturbation.
- `weak_hierarchy`: heading/CTA salience reduction.
- `typography_noise`: font-size, weight, line-height, and measure inconsistency.
- `color_contrast`: reduced contrast or noisy accents.
- `component_inconsistency`: radius, shadow, border, and padding mismatch in repeated groups.
- `layout_instability`: broken grid alignment, overflow, or unbalanced columns.
- `responsive_regression`: mobile/desktop mismatch, hidden CTA, broken nav, or overflow.
- `accessibility_risk`: contrast, tap target, or form-label issues.

Severity ranges:

```text
subtle: 0.15-0.30
visible: 0.30-0.60
obvious: 0.60-1.00
```

## Split Logic

External web:

- Split by `domain_hash`.
- Keep template families together where detectable.
- Deduplicate by file hash, perceptual hash, frozen embedding similarity, and DOM signature before splitting.

Mobile:

- Split by `app_id_hash`.
- Keep flows and responsive siblings together.

Internal/local:

- Split by `sample_id` or explicit base split files.
- Keep all corruptions for a source sample in the same split.

Default ratios:

```text
train: 70%
val: 10%
test: 20%
```

Local smoke exceptions may use 80/10/10 to match existing PawlBench/Pawl-JEPA JSONL helpers.

## M1 Screenshot JEPA Loader

The M1 baseline uses the canonical smoke corpus directly:

- `manifest.jsonl` supplies `screen_id`, screenshot path, dimensions, split group, DOM/accessibility paths, metrics path, and optional metadata pointers.
- `splits.json` supplies train/val/test membership and pair split groups.
- Screenshots are loaded with `pawl_jepa.data.normalize_image_padded`, preserving aspect ratio on a fixed square canvas.
- Region and design-token manifests may be retained as metadata paths for reports/debugging, but M1 does not use semantic regions or design tokens for masking.
- The same loader is used by JEPA training, frozen embedding export, and the pairwise ranking probe.

## M2 Semantic-Region JEPA Loader

M2 uses the same screen records and screenshot normalization as M1, plus `regions.jsonl`.

- Region bboxes are stored in original screenshot coordinates and mapped through `normalize_image_padded` metadata at the active training `image_size`.
- Mapped bboxes are converted to deterministic patch IDs using the requested `patch_size`.
- Supported target region types for the smoke M2 sampler are `navbar`, `hero`, `cta`, `card`, `card_grid`, `form`, `sidebar`, `footer`, `modal`, `table`, and `unknown`.
- If a screen has no valid semantic region for the active patch grid, the sampler explicitly emits an M1-compatible random-block fallback mask with a fallback reason.
- M2 reports target region type counts, fallback rate, average target area ratio, and split-level region coverage. No schema change is required for the current `regions.jsonl`.

## M2.5 Diagnostic Inputs

M2.5 does not require new dataset files. It reuses:

- M1/M2 persisted frozen embeddings from each run's `probe/embeddings.jsonl`.
- `manifest.jsonl` for split, original/corrupted, template, and metrics paths.
- `pairs.jsonl` for corruption type, severity, pair family, and original-vs-corrupted pair-side labels.
- `regions.jsonl` for per-screen region-type metadata used in nearest-neighbor retrieval summaries.
- `design_tokens.jsonl` and `metrics.json` for the deterministic metrics-only diagnostic baseline.

The canonical report path is:

```bash
uv run ui-jepa-m25-ablation data/processed/ui_jepa_v0_smoke \
  --out checkpoints/ui_jepa_m25 \
  --report-out reports/ui_jepa_v0_smoke/m25_diagnostics_report.json \
  --b0-report reports/ui_jepa_v0_smoke/b0_report.json \
  --m1-report reports/ui_jepa_v0_smoke/m1_report.json \
  --m2-report reports/ui_jepa_v0_smoke/m2_report.json
```

## `ui_preference_v0`

Purpose: build the first offline-testable synthetic/local UI preference critic after M2/M2-strong showed no preference value.

Default output:

```text
data/processed/ui_preference_v0/
  screens.jsonl
  pairs.jsonl
  summary.json
```

`screens.jsonl` contains one row per smoke screen with `screen_id`, split, source/template group, deterministic metrics features, design-token features, semantic-region summary features, optional embedding references for DINOv2/M1/M2/M2-strong, and `schema_version: ui_preference_v0_screen_v1`.

`pairs.jsonl` contains one row per pair with `pair_id`, left/right/preferred screen IDs, pair family, corruption type, severity, difficulty, `left_is_preferred`, split, synthetic label provenance, and `schema_version: ui_preference_v0_pair_v1`.

Build locally:

```bash
uv run ui-preference-dataset-build data/processed/ui_jepa_v0_smoke --out data/processed/ui_preference_v0
```

Expensive embeddings are never generated automatically by this dataset build. Missing feature groups are marked unavailable with manual commands in `summary.json`.

## Validation Tests

Required dataset validation:

- `manifest.jsonl` exists and has unique `sample_id` values.
- Every screen row references existing artifacts.
- Screenshot dimensions match `width` and `height`.
- DOM/accessibility/view hierarchy paths are either null or valid files.
- Region rows reference valid `sample_id` values.
- Region bboxes are inside screenshot bounds.
- Region `area_ratio` is between 0 and 1.
- Pair rows reference valid left/right samples.
- Preferred sample is either null, left, or right.
- Split leakage check proves no `split_group_id` appears in multiple splits.
- Corrupted variants are in the same split as the source screen.
- Design token JSON validates required top-level keys.
- Quality filters tag blank/loading/broken/chrome/PII-risk samples.

Current implemented validation:

- PawlBench dataset validation for local jitter datasets.
- Positive corpus validation for artifact groups and local `manifest.jsonl`.
- Label validation and provenance reports.
- UI-JEPA smoke validation for manifest artifacts, screenshot dimensions, semantic region bounds, pair references, split leakage, design token presence, deterministic pair IDs, pair-orientation sanity, and per-split constant-side baselines.

## Current Commands

Local positive corpus:

```bash
uv run pawlbench-design-positive-build examples/beautiful_ui_v0 --out artifacts/datasets/beautiful_ui_v0 --seed 42
uv run pawlbench-design-positive-validate artifacts/datasets/beautiful_ui_v0 --out artifacts/datasets/beautiful_ui_v0_validation
uv run pawlbench-design-positive-report artifacts/datasets/beautiful_ui_v0 --out artifacts/datasets/beautiful_ui_v0_report
```

Local corrupted pair corpus:

```bash
uv run pawlbench-design-build examples/local_v1 --out artifacts/datasets/local_v1 --seed 42
uv run pawlbench-design-validate artifacts/datasets/local_v1 --out artifacts/datasets/local_v1_validation
uv run pawlbench-design-split artifacts/datasets/local_v1 --out artifacts/datasets/local_v1_splits --seed 42
```

Canonical UI-JEPA smoke corpus from existing local renders/corruptions:

```bash
uv run ui-jepa-smoke-build --source examples/local_v1 --out data/processed/ui_jepa_v0_smoke --seed 42
uv run ui-jepa-smoke-validate data/processed/ui_jepa_v0_smoke --out data/processed/ui_jepa_v0_smoke_validation
```

Canonical UI-JEPA smoke corpus from source HTML, rendering fresh deterministic corruptions:

```bash
uv run ui-jepa-smoke-build --source examples/beautiful_ui_v0 --out data/processed/ui_jepa_v0_smoke --seed 42
```
