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
