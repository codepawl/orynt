# UI-JEPA M2 Semantic-Region Screenshot JEPA

- Valid M2 baseline: True
- Recommended next stage: improve_M2_masking_or_model_scale_before_DOM_aware
- Final train JEPA loss: 0.9952423030679877
- Final val JEPA loss: 0.7295197754195242
- Collapse valid: True
- Fallback random-mask rate: 0.0

## Frozen Probe

- train: accuracy=0.49970845481049564 pairs=1715 lift=-0.0005830903790087216
- val: accuracy=0.5 pairs=234 lift=0.0
- test: accuracy=0.49765258215962443 pairs=213 lift=-0.004694835680751186

## Comparison

- m1_random_block_jepa: test_accuracy=0.49765258215962443 valid=True
- m2_semantic_region_jepa: test_accuracy=0.49765258215962443 valid=True
- b0_frozen_dinov2: test_accuracy=0.7652582159624414 valid=True
- metrics_only: test_accuracy=0.8591549295774648 valid=True
- M2 improves over M1: False
- M2 closes gap to B0: False
- Metrics-only still dominates: True

## Warnings

- M2 is non-collapsed but near chance on the frozen preference probe; semantic masking alone may be insufficient.
- The deterministic metrics-only baseline still beats the learned screenshot embeddings on test accuracy.
