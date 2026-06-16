# UI-JEPA Dataset and Model Plan

Version: v0.1  
Scope: research plan for validating UI-JEPA variants as a frontend design critic / taste planner.  
Primary objective: find the smallest model + dataset setup that improves a closed-loop frontend pipeline: screenshot/code -> UI-JEPA critique -> Claude/ChatGPT/Codex implementation -> rendered screenshot -> UI-JEPA re-evaluation.

---

## 1. Working thesis

The model should not be optimized to generate frontend code directly. The first useful version should be a **UI representation model + critic** that can rank designs, locate visual/design issues, and emit structured instructions for a stronger code model.

The research hypothesis is:

> A JEPA-style encoder trained on UI screenshots, DOM/accessibility trees, and design-token structure will learn better UI-specific representations than a generic vision encoder, especially when masking follows semantic UI regions instead of random image patches.

This follows the core I-JEPA idea: predict latent target-block representations from visible context, not pixels. I-JEPA reports that target blocks need sufficiently large semantic scale and context must be spatially informative. For UI, this should translate into masking full sections/components such as navbars, heroes, cards, forms, sidebars, CTAs, pricing tables, and footers rather than arbitrary 16x16 patches.

---

## 2. Research references to guide setup

### JEPA / self-supervised visual representation

- **I-JEPA**: predicts representations of target blocks from context blocks in the same image; emphasizes large semantic target blocks and informative spatial context.  
  Reference: Assran et al., *Self-Supervised Learning from Images with a Joint-Embedding Predictive Architecture*, 2023.  
  https://arxiv.org/abs/2301.08243

- **V-JEPA**: feature-prediction objective for videos without pretrained image encoders, text, negative examples, reconstruction, or manual supervision. Useful inspiration for later responsive / interaction / action-conditioned UI models.  
  Reference: Bardes et al., *Revisiting Feature Prediction for Learning Visual Representations from Video*, 2024.  
  https://arxiv.org/abs/2404.08471

- **V-JEPA 2**: two-phase world-model pattern: self-supervised pretraining from visual data, then small post-training for action/planning. This maps well to UI-JEPA pretraining followed by preference/critique heads.  
  Reference: Assran et al., *V-JEPA 2: Self-Supervised Video Models Enable Understanding, Prediction and Planning*, 2025.  
  https://arxiv.org/abs/2506.09985

- **MAE**: important baseline for masked reconstruction. It reconstructs pixels and uses high mask ratios. UI-JEPA should test against this because pixel reconstruction may overfit local UI texture while JEPA may learn higher-level layout.  
  Reference: He et al., *Masked Autoencoders Are Scalable Vision Learners*, 2021/2022.  
  https://arxiv.org/abs/2111.06377

- **DINOv2**: strong generic self-supervised vision baseline. Use it as a frozen baseline before spending compute on custom UI-JEPA.  
  Reference: Oquab et al., *DINOv2: Learning Robust Visual Features without Supervision*, 2023/2024.  
  https://openreview.net/forum?id=a68SUt6zFt

### UI / screen representation learning

- **UIBert**: uses image, text, and structural metadata for UI understanding; supports the decision to include DOM/view hierarchy and component metadata, not screenshot only.  
  Reference: Bai et al., *UIBert: Learning Generic Multimodal Representations for UI Understanding*, 2021.  
  https://arxiv.org/abs/2107.13731

- **Pix2Struct**: pretrains by parsing masked web screenshots into simplified HTML; confirms that web screenshots and HTML structure are a strong pretraining source for visually situated language and UI tasks.  
  Reference: Lee et al., *Pix2Struct: Screenshot Parsing as Pretraining for Visual Language Understanding*, 2023.  
  https://proceedings.mlr.press/v202/lee23g.html

- **ScreenAI**: specializes a VLM for UI and infographics; uses screen annotation tasks for type/location of UI elements, then generates QA/navigation/summarization datasets. This motivates adding screen-annotation-style evaluation probes.  
  Reference: Baechler et al., *ScreenAI: A Vision-Language Model for UI and Infographics Understanding*, 2024.  
  https://arxiv.org/abs/2402.04615

- **LayoutLMv3**: useful architectural reference for joint text-image-layout masking and word-patch alignment in structured visual documents. UI-JEPA can adapt the alignment idea to text/component/patch alignment.  
  Reference: Huang et al., *LayoutLMv3: Pre-training for Document AI with Unified Text and Image Masking*, 2022.  
  https://arxiv.org/abs/2204.08387

### UI quality / taste / critique

- **UIClip**: trains UI design quality assessment from screenshots + natural language descriptions using automated crawling, synthetic augmentation, and human ratings. It also creates original-vs-jittered UI pairs by introducing design defects. This is directly relevant to the taste/ranking dataset.  
  Reference: Wu et al., *UIClip: A Data-driven Model for Assessing User Interface Design*, 2024.  
  https://arxiv.org/html/2404.12500v1

- **UICrit**: 3,059 designer critiques and quality ratings for 983 mobile UIs. This is valuable for critique-head evaluation and instruction generation, not for large-scale pretraining.  
  Reference: Duan et al., *UICrit: Enhancing Automated Design Evaluation with a UI Critique Dataset*, UIST 2024.  
  https://people.eecs.berkeley.edu/~bjoern/papers/duan-uicrit-uist2024.pdf

- **AVA / NIMA-style aesthetic assessment**: useful as general image-aesthetic baselines, but not enough for frontend taste because UI quality depends on hierarchy, task fit, interaction affordance, accessibility, and design-system consistency. Use only as auxiliary baseline if needed.

### UI-to-code / web datasets and benchmarks

- **WebSight**: synthetic dataset with 2M HTML/screenshot pairs. Good for controlled initial pretraining and screenshot-code alignment, but synthetic bias should be measured.  
  Reference: Laurençon et al., *Unlocking the conversion of Web Screenshots into HTML Code with the WebSight Dataset*, 2024.  
  https://arxiv.org/abs/2403.09029

- **WebCode2M**: 2.56M real-world webpage design-image/code/layout instances, quality-filtered with a scoring model. Strong candidate for real-web pretraining if access/licensing is usable.  
  Reference: Gui et al., *WebCode2M: A Real-World Dataset for Code Generation from Webpage Designs*, 2025.  
  https://arxiv.org/html/2404.06369v2

- **WebUI**: 400K rendered web pages with automatically extracted metadata; domain-grouped splits are important to avoid leakage. Strong source for metadata-rich web UI pretraining.  
  Reference: Wu et al., *WebUI: A Dataset for Enhancing Visual UI Understanding with Web Semantics*, 2023.  
  https://arxiv.org/abs/2301.13280

- **RICO**: more than 66K unique Android UI screens and about 3M UI elements from more than 9.3K Android apps. Good for mobile structure, view hierarchy, and component-level probes.  
  Reference: Deka et al., *Rico: A Mobile App Dataset for Building Data-Driven Design Applications*, 2017.  
  https://www.interactionmining.org/archive/rico

- **MobileViews**: current large mobile GUI dataset. The v3 paper describes over 1.2M unique screenshot-view hierarchy pairs from more than 30K Android apps. Good for mobile scaling and modern UI distribution.  
  Reference: Gao et al., *MobileViews: A Million-scale and Diverse Mobile GUI Dataset*, 2025.  
  https://arxiv.org/html/2409.14337v3

- **Design2Code**: 484 real-world webpages with automatic and human evaluation for screenshot-to-code generation. Use as a holdout benchmark for closed-loop frontend generation, not pretraining.  
  Reference: Si et al., *Design2Code: Benchmarking Multimodal Code Generation for Automated Front-End Engineering*, 2024/2025.  
  https://arxiv.org/abs/2403.03163

- **Web2Code**: dataset and evaluation framework for webpage understanding and code generation; useful for pipeline-level comparisons.  
  Reference: Yun et al., *Web2Code: A Large-scale Webpage-to-Code Dataset and Evaluation Framework for Multimodal LLMs*, 2024.  
  https://arxiv.org/abs/2406.20098

- **MultiUI**: webpage-UI instruction dataset with 7.3M samples from 1M websites. Useful later for instruction/QA alignment, not required for the first UI-JEPA critic.  
  Reference: Liu et al., *Harnessing Webpage UIs for Text-Rich Visual Understanding*, 2024.  
  https://arxiv.org/abs/2410.13824

---

## 3. What to validate first

Do not begin by training one large JEPA. Build a dataset + benchmark harness that can compare model variants under the same conditions.

### Core hypotheses

| ID | Hypothesis | Why it matters | Validation signal |
|---|---|---|---|
| H1 | Semantic UI region masking beats random patch masking. | UI meaning lives in sections/components, not arbitrary patches. | Better region retrieval, issue detection, pairwise taste accuracy. |
| H2 | DOM/view hierarchy improves UI representation over screenshot-only. | UI contains explicit structure: role, bbox, text, hierarchy, interaction flags. | Better component classification, layout issue localization, responsive reasoning. |
| H3 | Design-token prediction improves taste/review usefulness. | Frontend quality depends on spacing, typography, color, radius, shadows, density. | Better issue labels and generated instructions. |
| H4 | Self-supervised UI-JEPA + small ranking head beats frozen DINOv2/SigLIP/CLIP for UI preference. | Need proof that custom UI pretraining is worth compute. | Pairwise AUC, Spearman with human/designer ratings, closed-loop improvement. |
| H5 | Responsive target prediction improves frontend-fix instructions. | Good frontend output must work across viewport sizes. | Better mobile/desktop consistency ranking and fewer responsive regressions. |

### Primary success definition

A model version is a candidate for the main pipeline only if it improves **downstream frontend iteration**, not merely JEPA pretraining loss.

Minimum success gate:

1. Pairwise preference accuracy on `good > corrupted` examples is at least 10 percentage points above a frozen DINOv2 baseline.
2. Issue classifier has usable per-category F1 for layout, spacing, hierarchy, contrast, density, and component consistency.
3. In a 50-page closed-loop test, instructions from the critic produce more human-preferred improvements than a no-critic prompt.
4. The model can run cheaply enough for PR review or local iteration: target < 1 second per screenshot on a single mid/high-tier GPU for inference.

---

## 4. Dataset layers

The dataset should be layered. Each layer answers a different question.

### Layer A — Unlabeled UI pretraining corpus

Purpose: train the UI-JEPA encoder without manual labels.

Sources:

- WebSight: screenshot + HTML, synthetic but large.
- WebUI: rendered webpage + metadata, real web but noisy.
- WebCode2M: real webpage design image + code + layout, if accessible.
- RICO: mobile screenshot + view hierarchy.
- MobileViews: modern mobile screenshot + view hierarchy.

Recommended first scale:

| Stage | Size | Composition | Goal |
|---|---:|---|---|
| Smoke | 5K-10K screens | mixed WebSight/WebUI/RICO | verify loader, schema, masks, loss curves. |
| Pilot | 50K-100K screens | 60% web, 40% mobile | compare screenshot-only vs DOM-aware variants. |
| Validation | 300K-500K screens | include more real web + modern mobile | decide whether UI-JEPA beats frozen baselines. |
| Scale | 1M+ screens | WebCode2M/MobileViews/WebSight mix | train production candidate only after pilot proves value. |

### Layer B — Semantic region/mask corpus

Purpose: train and evaluate semantic masking.

Each sample should expose regions like:

- `navbar`
- `hero`
- `sidebar`
- `footer`
- `form`
- `search_box`
- `card`
- `card_grid`
- `pricing_table`
- `table`
- `chart`
- `modal`
- `toast`
- `cta_group`
- `text_block`
- `image_block`
- `whitespace_block`

Region sources:

1. DOM/accessibility tree bbox grouping.
2. Mobile view hierarchy grouping.
3. HTML section heuristics: `header`, `nav`, `main`, `section`, `article`, `aside`, `footer`, role attributes, aria labels.
4. CSS/layout heuristics: flex/grid containers, repeated card patterns, sticky/fixed elements.
5. Screenshot fallback: connected components, OCR boxes, edge/contour grouping, saliency-like block detection.

### Layer C — Synthetic preference/ranking corpus

Purpose: teach taste after self-supervised pretraining.

Base assumption:

> Original UI is preferred over a systematically corrupted version, unless the source UI itself fails quality filters.

Create pairwise records:

```json
{
  "pair_id": "pair_000001",
  "source_sample_id": "ui_000001",
  "preferred": "original",
  "rejected": "corrupt_spacing_v2",
  "corruptions": ["inconsistent_spacing", "weak_hierarchy"],
  "severity": 0.65,
  "target_issues": [
    {"type": "inconsistent_spacing", "region_id": "pricing_grid", "severity": "medium"},
    {"type": "weak_visual_hierarchy", "region_id": "hero", "severity": "high"}
  ]
}
```

Corruption families:

| Family | Corruption examples | Labels generated |
|---|---|---|
| Spacing | random margin/padding jitter, inconsistent card gap, broken vertical rhythm | `inconsistent_spacing`, `poor_alignment`, `dense_layout` |
| Hierarchy | shrink hero heading, weaken CTA, make secondary text too dominant | `weak_visual_hierarchy`, `unclear_cta` |
| Typography | inconsistent font sizes, poor line-height, too many weights, narrow/wide measure | `poor_typography`, `low_readability` |
| Color | reduce contrast, random accent colors, palette overload | `low_contrast`, `noisy_palette`, `weak_brand_consistency` |
| Component consistency | mixed radius/shadow/border styles across same card group | `inconsistent_components` |
| Layout | break grid alignment, overflow content, unbalanced columns | `layout_instability`, `poor_composition` |
| Responsive | desktop OK but mobile overflow, hidden CTA, broken nav | `responsive_regression` |
| Accessibility | contrast below threshold, tiny tap targets, form label issues | `accessibility_risk` |

Severity levels:

- `0.15-0.30`: subtle defect, good for hard comparisons.
- `0.30-0.60`: visible defect, good for training.
- `0.60-1.00`: obvious defect, good for early model signal but avoid overusing.

Keep all corrupted variants in the same split as their source UI.

### Layer D — Human/designer critique corpus

Purpose: evaluate and calibrate critique output.

Sources:

- UICrit designer critiques and ratings.
- Small internal annotation set created by you/team.
- Optional LLM/VLM pseudo-critiques, but never use them as the only evaluation target.

Recommended internal annotation target:

| Stage | Samples | Annotators | Purpose |
|---|---:|---|---|
| Tiny eval | 100 screens | yourself + 1 designer/dev | catch obvious metric failure. |
| Pilot eval | 300-500 screens | 2-3 people | pairwise preference, issue labels, instruction usefulness. |
| Release eval | 1K-2K screens | 3+ people or structured review process | validate model selection. |

Annotation form:

```json
{
  "sample_id": "ui_001234",
  "overall_quality": 0.74,
  "aesthetic_quality": 0.78,
  "usability_quality": 0.70,
  "design_system_consistency": 0.65,
  "issues": [
    {
      "type": "weak_visual_hierarchy",
      "region_bbox": [80, 120, 720, 420],
      "severity": "high",
      "critique": "Hero section does not make the primary action visually dominant.",
      "instruction": "Increase heading/CTA contrast and reduce competing secondary elements."
    }
  ],
  "pairwise_preferences": [
    {"other_sample_id": "ui_001235", "winner": "ui_001234", "confidence": 0.8}
  ]
}
```

### Layer E — Closed-loop frontend evaluation corpus

Purpose: verify that the model helps the actual frontend pipeline.

Use cases:

1. Existing frontend screenshot + source code -> critic JSON -> coding model patch -> render -> re-score.
2. Design screenshot -> coding model implementation -> critic identifies visual/code-level deviations.
3. PR screenshot diff -> critic detects aesthetic regression.

Minimum test set:

| Set | Size | Content |
|---|---:|---|
| `loop_easy_20` | 20 pages | simple landing/docs/pricing pages. |
| `loop_mixed_50` | 50 pages | landing, dashboard, auth, settings, docs, e-commerce. |
| `loop_hard_100` | 100 pages | dense dashboards, responsive pages, charts, tables, forms. |

Hold out Design2Code and/or Web2Code-style pages for evaluation only. Do not train on the exact benchmark pages.

---

## 5. Canonical data schema

Use a unified manifest-first dataset. Store large binary files separately; keep metadata in Parquet/JSONL.

### Directory layout

```text
data/
  raw/
    websight/
    webui/
    webcode2m/
    rico/
    mobileviews/
    uicrit/
  interim/
    screenshots_normalized/
    dom_normalized/
    ocr/
    regions/
    design_tokens/
    corruption_renders/
  processed/
    ui_jepa_v0/
      manifest.parquet
      splits.parquet
      regions.parquet
      pairs.parquet
      critiques.parquet
      images/
      dom/
      masks/
      tokens/
  eval/
    heldout_real_web/
    heldout_mobile/
    design2code_holdout/
    closed_loop/
  schemas/
    sample.schema.json
    region.schema.json
    pair.schema.json
    critique.schema.json
```

### `manifest.parquet`

One row per UI screen/render.

Required columns:

```text
sample_id: string
source_dataset: enum[websight, webui, webcode2m, rico, mobileviews, uicrit, internal]
platform: enum[web_desktop, web_mobile, android, ios, unknown]
screenshot_path: string
width: int
height: int
dpr: float | null
viewport_width: int | null
viewport_height: int | null
source_url_hash: string | null
domain_hash: string | null
app_id_hash: string | null
page_type: enum[landing, dashboard, auth, settings, pricing, docs, ecommerce, feed, form, table, unknown]
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

### `regions.parquet`

One row per semantic region/component group.

```text
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
source: enum[dom, accessibility_tree, view_hierarchy, heuristic, cv_fallback]
confidence: float
```

### `design_tokens.json`

One JSON object per sample.

```json
{
  "colors": {
    "background": ["#ffffff", "#f8fafc"],
    "text": ["#0f172a", "#475569"],
    "accent": ["#2563eb"],
    "contrast_warnings": 2
  },
  "typography": {
    "font_families": ["Inter", "system-ui"],
    "font_sizes_px": [12, 14, 16, 20, 32, 48],
    "heading_scale_ratio": 1.35,
    "line_heights": [1.2, 1.5]
  },
  "spacing": {
    "dominant_gaps_px": [8, 16, 24, 32, 48],
    "spacing_consistency_score": 0.82
  },
  "shape": {
    "radius_px": [8, 12, 16],
    "shadow_levels": 3,
    "border_widths": [1]
  },
  "layout": {
    "grid_detected": true,
    "columns": 12,
    "density_score": 0.58,
    "alignment_score": 0.79
  }
}
```

### `pairs.parquet`

Pairwise preference and contrastive/evaluation pairs.

```text
pair_id: string
left_sample_id: string
right_sample_id: string
preferred_sample_id: string | null
pair_type: enum[good_corrupt, human_pref, same_template, same_page_responsive, same_app_flow, negative_random]
preference_source: enum[synthetic, human, designer, llm_pseudo, heuristic]
confidence: float
issue_labels: list[string]
severity: float | null
split: enum[train, val, test]
```

---

## 6. Normalization and preprocessing

### Screenshot normalization

Preserve aspect ratio. Do not blindly squash UI screenshots into a square image.

Recommended canonical inputs:

| Platform | Canonical canvas | Method |
|---|---:|---|
| Web desktop | 1024x768 or 1280x720 | resize longest side then pad. |
| Web mobile | 390x844 or 430x932 | preserve mobile aspect. |
| Android | original resolution bucket + padded canvas | keep coordinate consistency with view hierarchy. |
| Universal training | 768x768 padded | useful for pilot only. |

For pilot experiments, use 768x768 padded input with coordinate metadata retained. For serious responsive work, keep native aspect buckets.

### DOM / view hierarchy normalization

Normalize all structural sources into a common tree format:

```json
{
  "node_id": "n_001",
  "parent_id": "n_000",
  "tag_or_class": "button",
  "role": "button",
  "text": "Start free trial",
  "text_len": 16,
  "bbox": [742, 40, 894, 88],
  "visible": true,
  "clickable": true,
  "depth": 4,
  "attributes": {
    "class_tokens": ["btn", "primary"],
    "aria_label": null
  }
}
```

For privacy and copyright control, store raw text only if license permits. Otherwise store text length, OCR category, hashed text, or redacted text.

### Design token extraction

Extract from HTML/CSS when available, otherwise infer from screenshot:

- dominant colors by quantization/cluster.
- contrast ratios for text-like regions.
- repeated gap sizes from bboxes.
- font-size estimates from OCR/text boxes.
- radius/shadow proxies from component crops.
- layout density and whitespace ratio.

### Region proposal algorithm

Priority order:

1. Use explicit semantic HTML and ARIA roles.
2. Use DOM groups and CSS layout containers.
3. Use repeated component pattern detection.
4. Use mobile view hierarchy groupings.
5. Use OCR + connected components fallback.

Reject regions that are too small or too trivial:

```text
min_area_ratio = 0.02
max_area_ratio = 0.65
min_text_or_visual_density = configurable
exclude_regions = [cookie_banner, browser_chrome, full_blank_area, watermark]
```

---

## 7. Model variants to compare

Start small. The goal is to discover which structure matters, not to win with scale.

### Baselines

| ID | Model | Purpose |
|---|---|---|
| B0 | Frozen DINOv2/SigLIP/CLIP + MLP ranking head | prove custom UI-JEPA is useful. |
| B1 | MAE-style screenshot encoder | compare latent prediction vs pixel reconstruction. |
| B2 | Heuristic design-score model | alignment/contrast/density/rhythm only. |
| B3 | LLM/VLM zero-shot critic | compare against prompt-only review. |

### UI-JEPA variants

| ID | Variant | Inputs | Masking | Target | Why test it |
|---|---|---|---|---|---|
| M1 | Screenshot-only Random-JEPA | screenshot patches | random block | visual latent | closest to I-JEPA baseline. |
| M2 | Screenshot-only Region-JEPA | screenshot patches | semantic UI region | visual latent | tests H1. |
| M3 | DOM-aware Late Fusion JEPA | screenshot + DOM tokens | semantic UI region | visual latent + DOM probe | tests whether DOM helps heads without changing JEPA core. |
| M4 | DOM-aware Fusion JEPA | screenshot + DOM/component tokens | semantic UI region/component | fused latent | tests H2. |
| M5 | Design-token JEPA | screenshot + DOM + design tokens | hide style/layout tokens | target style/layout latent | tests H3. |
| M6 | Responsive-JEPA | desktop/mobile sibling renders | desktop context -> mobile target or inverse | responsive latent | tests H5. |
| M7 | Action-JEPA | current UI + edit action | proposed change/action | target improved UI latent | later-stage world model, not MVP. |

Recommended first comparison:

```text
B0 vs M1 vs M2 vs M3
```

Only move to M4/M5/M6 after M2 or M3 clearly beats B0.

---

## 8. Recommended architecture

### UI-JEPA-S: pilot model

```text
Inputs
  screenshot image, padded/resized
  optional DOM/view hierarchy tokens
  optional design-token vector

Visual tokenizer
  ViT-S or ViT-B
  patch size: 16 or 32
  embedding dim: 384 or 768

Context encoder
  encodes visible screenshot patches and optional visible DOM/component tokens

Target encoder
  EMA copy of context/image encoder
  receives target region view
  stop-gradient target representation

Predictor
  4-8 layer transformer
  receives context tokens + target position/region embeddings
  predicts target latent tokens

Loss
  normalized L2 or cosine distance between predicted and target latent
  optional variance/covariance regularization if collapse appears

Downstream heads
  region_type_head
  issue_multilabel_head
  quality_regression_head
  pairwise_ranking_head
  critique_adapter_head
```

### Token types

```text
[IMG_PATCH]    visual patch embedding
[DOM_NODE]     tag/role/type/text_len/bbox/depth/clickable embedding
[REGION]       semantic region type + bbox + hierarchy embedding
[STYLE]        palette/spacing/typography/radius/shadow embedding
[VIEWPORT]     width/height/platform/breakpoint embedding
[TARGET_POS]   masked target position/region query
```

### DOM token encoding

Each DOM token should include:

```text
tag/role embedding
component type embedding
bbox positional encoding: x1, y1, x2, y2, area
text length bucket
clickable/input/scrollable flags
depth embedding
sibling index embedding
CSS class/token hash embedding, if safe
```

### Fusion options

Test in order:

1. **Late fusion**: image encoder produces z; DOM encoder produces d; concatenate for downstream heads only. Simpler and safer.
2. **Cross-attention fusion**: image context tokens attend to DOM tokens with bbox/patch alignment. More powerful but riskier.
3. **Unified transformer**: all image/DOM/style tokens in one transformer. Stronger but heavier and harder to debug.

Do not begin with unified transformer.

---

## 9. Masking strategy

### M1 random block mask

Replicates I-JEPA-like image masking for baseline.

```text
sample 4 target blocks
area ratio: 0.10-0.35 each
context keeps distributed non-target patches
avoid target overlap
```

### M2 semantic region mask

Primary UI-specific objective.

```text
sample target from semantic regions
region area ratio: 0.03-0.60
prefer regions with interaction/text/layout significance
context must include at least 3 macro zones: top, middle, bottom or left/center/right
mask full region + small margin
predict target latent from visible context + target position embedding
```

### M5 style/design-token mask

```text
mask palette, spacing scale, typography scale, radius/shadow tokens
context = screenshot + DOM without hidden token group
predict hidden style/layout token latent
```

### M6 responsive target prediction

```text
context = desktop screenshot/DOM/design tokens
target = mobile latent of same page
or context = mobile, target = desktop
loss = latent prediction + responsive consistency ranking
```

This requires paired renders from the same URL/component at multiple breakpoints.

---

## 10. Training phases

### Phase 0 — dataset and evaluation harness

Goal: no model training beyond baselines.

Tasks:

- Build unified manifest.
- Normalize screenshots.
- Normalize DOM/view hierarchy.
- Extract semantic regions.
- Generate first corruptions.
- Create stable splits by domain/app/template.
- Train B0 frozen encoder ranking baseline.

Done when:

- 5K-10K samples load end-to-end.
- 1K corruption pairs render correctly.
- B0 produces a non-random pairwise score.
- Evaluation reports are generated reproducibly.

### Phase 1 — screenshot-only JEPA

Goal: compare random vs semantic masking.

Models:

- M1 Screenshot Random-JEPA
- M2 Screenshot Region-JEPA

Dataset:

- 50K-100K screens.
- 50K-200K synthetic pairs.

Done when:

- M2 beats M1 and B0 on at least two downstream probes.
- Loss curves are stable.
- Nearest-neighbor retrieval shows UI-meaningful clusters.

### Phase 2 — DOM-aware JEPA

Goal: test whether DOM/view hierarchy improves critic performance.

Models:

- M3 Late Fusion
- M4 Cross-Attention Fusion, only if M3 helps.

Dataset:

- WebUI/WebCode2M/WebSight with DOM/HTML.
- RICO/MobileViews with view hierarchy.

Done when:

- DOM-aware model improves region issue localization.
- Component classification and region retrieval improve over M2.
- No obvious overfitting to source dataset templates.

### Phase 3 — taste/ranking/critique heads

Goal: make the model useful for frontend review.

Heads:

- pairwise ranking head.
- issue multilabel head.
- quality regression head.
- critique adapter JSON head or template-based instruction generator.

Training data:

- synthetic good/corrupt pairs.
- UICrit-style designer critiques for eval/calibration.
- small internal preference set.
- optional LLM pseudo labels with confidence filtering.

Done when:

- Pairwise good/corrupt AUC is high across corruption types, not only obvious defects.
- Human preference set improves over B0 and prompt-only critic.
- Model outputs region-grounded issues, not vague taste comments.

### Phase 4 — closed-loop frontend pipeline

Goal: prove real value for CodePawl/FrontPawl.

Loop:

```text
frontend source -> render screenshot -> UI-JEPA critique JSON -> Claude/ChatGPT/Codex patch -> render again -> UI-JEPA compare -> human/heuristic validation
```

Done when:

- The loop improves a heldout set more often than baseline prompts.
- It does not introduce frequent accessibility/responsive regressions.
- The critique JSON is stable enough to drive code changes.

Current local Phase 4B status:

- `ui_loop_v0` is implemented for `loop_easy_20`, `loop_mixed_50`, and `loop_hard_100` from local smoke artifacts.
- Critique JSON is converted into saved Codex-compatible patch contracts; no external LLM API is called.
- Deterministic patch mode operates only on copied local fixtures and removes known synthetic jitter CSS when provenance is present.
- `reports/ui_loop_v0_mixed_deterministic/closed_loop_report.json` and `reports/ui_loop_v0_hard_deterministic/closed_loop_report.json` pass the synthetic/local non-oracle gate with no-op mean critic delta `0.0`, `mean_critic_delta_non_oracle: 0.14`, and no accessibility/responsive regressions.
- Oracle reports are upper-bound evidence only. Manual-patch-import reports currently skip all tasks because no manual patches are present.
- This is not human taste evidence. Manual review labels must be ingested before real PR-review claims.

---

## 11. Evaluation design

### Representation probes

| Probe | Data | Metric | Purpose |
|---|---|---|---|
| Region type classification | semantic regions | accuracy/F1 | does encoder know UI parts? |
| Component retrieval | RICO/MobileViews/WebUI | Recall@K | does embedding cluster similar components? |
| Same-template retrieval | WebUI/WebSight/WebCode2M | Recall@K | does embedding capture layout structure? |
| Responsive sibling retrieval | paired breakpoints | Recall@K | does model understand responsive equivalence? |
| Screen type classification | page/screen category | F1 | landing vs dashboard vs form etc. |
| DOM-screenshot alignment | DOM bbox <-> patch | mAP / IoU | does visual structure align to metadata? |

### Taste and issue metrics

| Task | Metric |
|---|---|
| Good vs corrupted ranking | pairwise accuracy, AUC |
| Human preference ranking | pairwise accuracy, Kendall/Spearman correlation |
| Overall quality score | Spearman with designer/human rating |
| Issue detection | macro/micro F1 by issue type |
| Issue localization | IoU or region-hit rate |
| Instruction usefulness | human preference, patch acceptance rate, before/after score delta |

### Closed-loop metrics

Use mixed metrics. Do not rely only on SSIM/LPIPS because visual similarity does not equal UI quality.

Recommended metrics:

- Human pairwise preference: before vs after, or baseline prompt vs critic-guided prompt.
- Accessibility checks: contrast, tap target, form labels.
- Layout stability: overflow count, element alignment, viewport clipping.
- Component consistency: repeated-card variance, radius/shadow/gap variance.
- Visual fidelity if target design exists: SSIM/LPIPS/CLIP similarity plus layout metrics.
- Critique/action alignment: whether the patch addressed the issue type that UI-JEPA reported.
- Regression rate: percentage of pages that became worse.

---

## 12. Splitting and leakage control

This is critical. UI datasets have heavy template/domain duplication.

Rules:

1. Split by `domain_hash` for web pages, not by screenshot row.
2. Split by `app_id_hash` for mobile screens, not by screen row.
3. Keep original and all corrupted variants in the same split.
4. Keep responsive siblings in the same split.
5. Keep same template family in the same split when template detection is possible.
6. Deduplicate before splitting using perceptual hash + embedding similarity + DOM signature.
7. Keep benchmark sets train-excluded.

Recommended split:

```text
train: 70%
validation: 10%
test: 20%
```

For WebUI-like datasets, follow the domain-grouped split pattern rather than random split.

---

## 13. Deduplication and quality filters

### Deduplication

Use a multi-stage process:

```text
1. exact file hash
2. perceptual hash / imagehash
3. screenshot embedding similarity via frozen encoder
4. DOM tree signature similarity
5. source grouping: same URL/domain/app/template
```

### Quality filters

Reject or tag samples with:

- mostly blank screen.
- loading skeleton only.
- cookie wall / paywall / modal covering most content.
- viewport capture failure.
- severe compression artifacts.
- browser chrome accidentally included.
- PII or private content risk.
- broken CSS/assets.
- extreme non-UI screenshots.

Do not delete all “bad” UIs. Some should be retained as negative examples, but tag them explicitly.

---

## 14. Pseudo-labeling strategy

Pseudo labels are useful but should be treated as weak supervision.

### Heuristic labels

Generate deterministic scores for:

- contrast risk.
- alignment consistency.
- spacing consistency.
- density/whitespace ratio.
- repeated component variance.
- CTA salience.
- text hierarchy scale.
- overflow/clipping.

### LLM/VLM labels

Use a strong multimodal model to produce critique JSON for a subset:

```json
{
  "overall_score": 0.68,
  "issues": [
    {
      "type": "weak_visual_hierarchy",
      "region": "hero",
      "bbox": [64, 96, 920, 430],
      "severity": "high",
      "instruction": "Increase heading scale and make the primary CTA more visually dominant."
    }
  ],
  "confidence": 0.74
}
```

Use only high-confidence pseudo labels for training. Keep a human/designer set as final evaluation because LLM labels can reproduce model taste biases.

---

## 15. First experiment matrix

Run this before committing to a large architecture.

| Exp | Model | Data | Masking | Heads | Expected answer |
|---|---|---|---|---|---|
| E0 | B0 DINOv2/SigLIP frozen | 50K pairs | none | ranking | how strong is generic vision? |
| E1 | M1 Random-JEPA | 50K screens | random block | ranking | does JEPA training help at all? |
| E2 | M2 Region-JEPA | 50K screens | semantic region | ranking | does UI-aware masking help? |
| E3 | M2 + larger data | 100K-300K screens | semantic region | ranking/issue | does scale help? |
| E4 | M3 late DOM fusion | 100K screens with DOM/VH | semantic region | ranking/issue/localization | does structure help? |
| E5 | M5 design token head | 100K screens + tokens | region + style mask | issue/quality | does style prediction help taste? |
| E6 | closed-loop test | loop_mixed_50 | n/a | critique JSON | does it improve frontend output? |

Pick the winner by Pareto frontier:

```text
score = 0.30 * pairwise_preference
      + 0.20 * issue_F1
      + 0.20 * localization_score
      + 0.20 * closed_loop_human_win_rate
      + 0.10 * inference_efficiency_score
```

Do not select solely by pretraining loss.

---

## 16. Recommended MVP dataset recipe

Use this if the goal is a practical first validation, not a research-scale run.

### `ui_jepa_v0_smoke`

```text
screens:
  WebSight: 3,000
  WebUI or internal rendered web: 3,000
  RICO: 2,000
  MobileViews: 2,000

pairs:
  synthetic good/corrupt: 10,000
  same-template/same-domain retrieval pairs: 5,000
  random negatives: 10,000

human/designer eval:
  100-200 screens
  500 pairwise preferences

closed-loop:
  10-20 frontend pages/components
```

### `ui_jepa_v0_pilot`

```text
screens:
  WebSight: 30,000
  WebUI/WebCode2M/internal web: 40,000
  RICO: 10,000
  MobileViews: 20,000

pairs:
  synthetic good/corrupt: 100,000-300,000
  responsive pairs: 10,000 if available
  same-template/component retrieval pairs: 50,000

human/designer eval:
  300-500 screens
  1,000-2,000 pairwise preferences

closed-loop:
  50 frontend pages/components
```

### `ui_jepa_v1_candidate`

Only after M2/M3 proves value.

```text
screens:
  500K-1M+

pairs:
  1M+ synthetic preference pairs
  50K+ responsive pairs
  5K+ curated/human/pseudo-verified critique samples

closed-loop:
  100-300 pages/components
```

---

## 17. Critique JSON contract

The model should emit structured JSON, not prose.

```json
{
  "overall_score": 0.72,
  "aesthetic_score": 0.76,
  "usability_score": 0.68,
  "design_system_score": 0.70,
  "confidence": 0.81,
  "issues": [
    {
      "type": "weak_visual_hierarchy",
      "region_id": "hero",
      "bbox": [72, 96, 940, 430],
      "severity": "high",
      "evidence": ["primary CTA has low salience", "heading/body contrast is weak"],
      "instruction": "Increase hero heading scale/weight, reduce secondary text dominance, and make the primary CTA visually dominant."
    },
    {
      "type": "inconsistent_spacing",
      "region_id": "pricing_grid",
      "bbox": [80, 510, 980, 760],
      "severity": "medium",
      "evidence": ["card gaps vary significantly", "vertical padding differs across repeated cards"],
      "instruction": "Normalize card padding and grid gap using the existing spacing scale."
    }
  ],
  "implementation_constraints": {
    "preserve_content": true,
    "preserve_routes": true,
    "prefer_existing_design_tokens": true,
    "avoid_new_dependencies": true
  }
}
```

This JSON is then converted into a Codex/Claude/ChatGPT work contract.

---

## 18. Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Synthetic bias | WebSight/corruptions may not represent real production UIs. | Mix real web/mobile; hold out Design2Code/internal real UIs. |
| Taste is subjective | JEPA alone cannot infer preference distribution. | Train ranking/critique head with human/pseudo labels and maintain user-specific calibration. |
| Leakage by template/domain | Model may memorize layout families. | Split by domain/app/template and dedupe aggressively. |
| DOM dependence | Screenshot-only deployment may lack DOM. | Train screenshot-only baseline and DOM-aware optional path. |
| Overfitting to obvious corruptions | Model may detect artificial noise, not taste. | Use subtle corruptions, human hard pairs, real before/after examples. |
| Pixel similarity trap | Visual fidelity metrics may reward wrong UI. | Use issue/human/functional/accessibility metrics too. |
| LLM pseudo-label bias | Critic may mimic another model’s taste. | Use human eval and deterministic heuristics as independent checks. |
| Compute waste | Custom JEPA may not beat frozen encoders. | Run B0 first; only scale after pilot wins. |

---

## 19. Immediate implementation checklist

1. Create `manifest.parquet` with 5K-10K mixed samples.
2. Normalize screenshots into padded canonical canvas.
3. Normalize DOM/view hierarchy into common tree format.
4. Extract semantic regions and patch IDs.
5. Generate 5-8 corruption families with severity.
6. Create split groups by domain/app/template.
7. Train B0 frozen DINOv2/SigLIP + ranking head.
8. Train M1 random-mask screenshot JEPA.
9. Train M2 semantic-region screenshot JEPA.
10. Run M2.5 diagnostics and controlled stronger M2 ablations to compare M1/M2/stronger M2/B0/metrics on pairwise ranking, corruption/severity probes, original-vs-corrupted detection, and region-neighbor metadata.
11. Add DOM late fusion only if M2.5 shows useful representation signal and does not merely prove non-collapse.
12. If M2.5 remains near chance or metrics-only dominates, harden dataset labels or add a preference-aligned objective before DOM-aware work.
13. Run a 20-page closed-loop test before scaling.

Current Phase 3A update for the local smoke corpus:

- Manual CUDA M2-strong closes the undertraining hypothesis for this corpus: the run is valid/non-collapsed but remains near chance.
- Preference Critic v0 is the active path. It uses synthetic/local UI preference labels, deterministic metrics/design-token/region features, optional frozen embeddings, issue heads, hard-subset evaluation, and region-grounded critique JSON.
- Current ablations show metrics dominate and JEPA features do not add value, so DOM-aware JEPA remains blocked.
- Phase 4B mixed/hard closed-loop deterministic non-oracle evaluation has passed locally. The next useful evidence is Codex/user manual patches plus human/manual labels if reviewer preference disagrees with the critic.

---

## 20. Decision rule

Proceed to a larger UI-JEPA only if:

```text
M2.5 or M3 > B0 by meaningful margin on UI-specific downstream tasks
AND
critic-guided closed-loop frontend edits beat no-critic baseline
AND
the model produces region-grounded actionable instructions
```

If not, do not scale JEPA yet. Instead improve dataset quality, corruption realism, preference labels, and evaluation harness.

---

## 21. Suggested next file

After this plan, create:

```text
DATASET_SPEC.md
  exact schema, extraction scripts, split logic, corruption operators, and validation tests.

MODEL_EXPERIMENTS.md
  exact configs for B0/M1/M2/M3, training commands, metrics, and acceptance thresholds.
```
