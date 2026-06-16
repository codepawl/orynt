# UI Preference Critic v0

- Valid: True
- Best feature group: metrics
- JEPA features add value: False
- DINOv2 adds value over metrics: False
- Metrics still dominate: True
- Recommended next stage: freeze_jepa_architecture_work_for_this_corpus

## Feature Groups

- metrics: test_accuracy=0.9014084507042254 test_pairs=213 lift=0.39906103286384975
- design_tokens: test_accuracy=0.8450704225352113 test_pairs=213 lift=0.34272300469483563
- regions: test_accuracy=0.5117370892018779 test_pairs=213 lift=0.009389671361502261
- dinov2: skipped (missing feature groups: dinov2)
- m1: test_accuracy=0.4507042253521127 test_pairs=213 lift=-0.051643192488262935
- m2: test_accuracy=0.4835680751173709 test_pairs=213 lift=-0.018779342723004744
- m2_strong: test_accuracy=0.539906103286385 test_pairs=213 lift=0.03755868544600938
- metrics+regions: test_accuracy=0.892018779342723 test_pairs=213 lift=0.3896713615023474
- metrics+dinov2: skipped (missing feature groups: dinov2)
- metrics+dinov2+regions: skipped (missing feature groups: dinov2)
- metrics+dinov2+regions+m2_strong: skipped (missing feature groups: dinov2)
- all_available: test_accuracy=0.8215962441314554 test_pairs=213 lift=0.31924882629107976

## Hard Subsets

- full_test: available=True accuracy=0.9014084507042254 pairs=213
- hard_test: available=True accuracy=0.8786127167630058 pairs=173
- balanced_left_right_orientation: available=True accuracy=0.9009433962264151 pairs=212
- equal_or_near_equal_metric_deltas: available=True accuracy=0.9014084507042254 pairs=213
- same_corruption_close_severity: available=True accuracy=0.7534246575342466 pairs=73
- low_vs_medium_severity: available=False accuracy=None pairs=0
- cross_corruption_hard_pairs: available=True accuracy=0.9166666666666666 pairs=72
- metrics_ambiguous: available=True accuracy=0.9014084507042254 pairs=213
- dinov2_vs_metrics_disagreement: available=False accuracy=None pairs=0
