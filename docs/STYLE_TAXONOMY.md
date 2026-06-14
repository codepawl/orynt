# CodePawl Design Style Taxonomy

This taxonomy defines early design-quality dimensions for PawlBench Design labels, metrics, reports, and future Pawl-JEPA experiments. The dimensions are intentionally practical and measurable enough for local HTML examples.

## Visual Hierarchy

- Definition: How clearly the interface establishes priority among headings, body text, controls, and supporting details.
- Good signals: obvious primary heading, clear type scale, meaningful weight contrast, secondary content recedes appropriately.
- Bad signals: flattened type scale, competing headings, oversized secondary content, unclear reading order.
- Possible metric proxy: `font_size_ratio`, heading count, CTA count, hierarchy warning count.
- Possible human-label tag: `hierarchy_clear` or `hierarchy_flat`.

## Spacing Rhythm

- Definition: The consistency and comfort of margins, padding, gaps, and line-height across the page.
- Good signals: repeated spacing increments, comfortable grouping, clear separation between sections.
- Bad signals: cramped content, random gaps, inconsistent vertical rhythm, crowded controls.
- Possible metric proxy: visible element area distribution, median element area, viewport fill ratio, layout box gaps.
- Possible human-label tag: `spacing_consistent` or `spacing_cramped`.

## CTA Prominence

- Definition: How easy it is to find and understand the primary action.
- Good signals: primary CTA is visible, sufficiently contrasted, placed near relevant context, and distinct from secondary actions.
- Bad signals: hidden CTA, weak contrast, too many competing actions, unclear button hierarchy.
- Possible metric proxy: CTA-like element count, CTA contrast checks, button area relative to nearby text.
- Possible human-label tag: `cta_prominent` or `cta_weak`.

## Contrast And Accessibility

- Definition: Whether text and controls are readable and accessible across foreground/background combinations.
- Good signals: WCAG-style contrast passes, visible focus states, readable muted text, semantic structure.
- Bad signals: low-contrast text, washed-out buttons, invisible links, color-only communication.
- Possible metric proxy: `contrast_issue_count`, `min_contrast_ratio`, accessibility tree support.
- Possible human-label tag: `contrast_accessible` or `contrast_low`.

## Density

- Definition: The amount of information presented per viewport and whether it fits the task context.
- Good signals: dashboards are information-rich but scannable; landing pages leave room for hierarchy and persuasion.
- Bad signals: sparse operational pages, overloaded marketing pages, content squeezed without structure.
- Possible metric proxy: visible element count, body text length, viewport fill ratio.
- Possible human-label tag: `density_appropriate` or `density_mismatched`.

## Polish

- Definition: The degree to which the interface feels finished, aligned, and intentional.
- Good signals: consistent borders, alignment, type, color, spacing, and component treatments.
- Bad signals: accidental misalignment, inconsistent radii, uneven shadows, awkward text wrapping, unfinished states.
- Possible metric proxy: overflow checks, element alignment summaries, hierarchy warnings, contrast issues.
- Possible human-label tag: `polished` or `rough`.

## Generic-AI-Slop Risk

- Definition: Risk that a design looks generic, overdecorated, or produced from common AI visual tropes rather than the product context.
- Good signals: domain-specific layout, restrained decoration, useful information architecture, purposeful copy.
- Bad signals: vague hero copy, decorative gradient blobs, unrelated cards, generic SaaS composition, ornamental clutter.
- Possible metric proxy: weak proxy only; combine human labels with density, CTA, and hierarchy signals.
- Possible human-label tag: `domain_specific` or `generic_ai_slop`.

## Brand Fit

- Definition: How well the interface style matches a stated product, audience, and task.
- Good signals: visual tone supports the domain, components fit user workflow, copy and density match context.
- Bad signals: playful style on operational tools, corporate style on expressive portfolios, mismatched colors or imagery.
- Possible metric proxy: no reliable deterministic proxy yet; use human labels and metadata.
- Possible human-label tag: `brand_fit_good` or `brand_fit_poor`.

## Motion Readiness

- Definition: Whether the design has clear interaction affordances and could support useful transitions without confusing users.
- Good signals: obvious interactive states, stable layout, clear feedback targets, predictable navigation.
- Bad signals: ambiguous click targets, layout shifts, hidden state, motion that would distract from task completion.
- Possible metric proxy: interactive element count, layout stability checks, CTA count.
- Possible human-label tag: `motion_ready` or `motion_risky`.

## Responsive Structure

- Definition: How well layout, type, and controls adapt across viewport sizes.
- Good signals: columns collapse predictably, text remains readable, controls stay reachable, no overflow.
- Bad signals: horizontal overflow, clipped content, tiny controls, broken grid order.
- Possible metric proxy: horizontal overflow, vertical scroll height, viewport-specific render comparisons.
- Possible human-label tag: `responsive_good` or `responsive_broken`.

## Dashboard Clarity

- Definition: How well an operational interface supports scanning, comparison, and repeated action.
- Good signals: clear data groups, restrained visual styling, stable controls, meaningful labels, efficient density.
- Bad signals: marketing-like hero treatment, excessive decoration, weak table/card hierarchy, unclear status.
- Possible metric proxy: density, visible element count, heading/CTA balance, text length.
- Possible human-label tag: `dashboard_clear` or `dashboard_confusing`.

## Landing-Page Clarity

- Definition: How quickly a marketing or product page communicates offer, audience, and next action.
- Good signals: specific headline, concise supporting copy, visible CTA, credible proof, readable hero composition.
- Bad signals: vague value prop, buried CTA, too much text, purely decorative imagery, weak hierarchy.
- Possible metric proxy: heading count, CTA count, contrast metrics, body text length, viewport fill ratio.
- Possible human-label tag: `landing_clear` or `landing_vague`.
