# CodePawl Data Policy

This policy governs data used for CodePawl, PawlBench Design, and any future Pawl-JEPA training or publication. The default stance is conservative: only train on data CodePawl controls, has permission to use, or can clearly redistribute under compatible terms.

## Allowed For Training

- Self-authored HTML, CSS, JavaScript, screenshots, DOM snapshots, accessibility trees, and metrics created in this repository.
- Synthetic variants generated from self-controlled examples, including CodePawl jitter artifacts.
- Generated assets and examples where CodePawl has the right to use outputs for training and redistribution.
- Public-domain or permissively licensed examples when the license clearly allows commercial use, derivative works, model training, and redistribution of derived dataset records.
- Open-source templates or components only when license terms are compatible with the intended use and attribution is preserved.
- Human labels created by contributors who have agreed that labels may be used for research, product development, benchmark release, and model training.

## Allowed For Private Reference Only

- Public websites, product pages, design galleries, and design-system pages used for manual style study.
- Brand websites and creator portfolios reviewed to understand broad design patterns.
- Private notes that describe abstract design observations without copying exact layouts, assets, screenshots, logos, names, or proprietary text.
- Internal inspiration notes that are never included in released datasets, model training corpora, benchmark artifacts, or public reports as source material.

## Not Allowed By Default

- Training on copyrighted screenshots, product screenshots, logos, brand assets, portfolio images, Behance images, Dribbble shots, or creator work without explicit permission.
- Bulk scraping of websites, galleries, portfolios, or product pages.
- Redistribution of third-party screenshots or captured pages.
- Cloning exact page layouts, brand systems, copy, illustrations, icon sets, or visual assets.
- Using private customer data, private repositories, unpublished product screenshots, or confidential design files without a written data-use agreement.
- Training on data where license terms are unclear, noncommercial-only, no-derivatives, or incompatible with future publication.

## Attribution Requirements

- Preserve license files and attribution notices for open-source templates and components.
- Record source URL, license, author, retrieval date, and intended use for any third-party material that is allowed.
- Public benchmark releases must include a data card or equivalent source summary.
- If a source requires attribution in documentation or metadata, include it before using the data.

## Commercial-Use Caution

- Assume CodePawl may later publish Pawl-JEPA, PawlBench Design, technical reports, or commercial products.
- Do not include data that is limited to personal, educational, evaluation-only, or noncommercial use.
- When license language is ambiguous about model training, do not train on it by default.
- Keep private reference notes separate from training artifacts.

## Human-Label Handling

- Store human labels separately from private identity data.
- Record label task instructions, label schema, annotator consent terms, and review status.
- Do not include sensitive personal information in labels.
- Allow labels to reference abstract UI qualities such as spacing, hierarchy, contrast, density, clarity, and polish.
- Do not ask labelers to reproduce copyrighted designs or proprietary brand assets.

## Generated-Data Handling

- Record the generator, seed, source example, generation date, and transformation type when possible.
- Keep generated variants traceable to self-controlled originals.
- Mark synthetic labels as synthetic so they are not confused with human judgments.
- Review generated examples for accidental brand/logo/copyright leakage before including them in a release.

## Open-Source Template And Component Handling

- Prefer permissive licenses such as MIT, BSD, Apache-2.0, or CC0 when collecting examples.
- Check whether screenshots, fonts, icons, images, and bundled assets have separate licenses.
- Keep attribution and license metadata next to any derived artifacts.
- Do not assume a component library license covers third-party demo content or brand examples.

## Dataset Release Checklist

- All samples have documented provenance.
- All training samples are self-controlled, generated from self-controlled examples, permissively licensed, or explicitly permitted.
- No private-reference-only material is included.
- No third-party screenshots, logos, gallery images, or brand assets are redistributed.
- Licenses and attribution records are complete.
- Human-label consent and label schema are documented.
- Generated data is marked and reproducible where possible.
- Validation, split, and report artifacts pass.
- Known limitations and intended uses are documented.
- A maintainer reviews the dataset before publication.
