# UI-JEPA M1 Random-Block Screenshot JEPA

- Valid M1 baseline: True
- M1 vs B0: loses_to_b0
- Recommended next stage: M2_semantic_mask_jepa
- Final train JEPA loss: 0.9302155881217031
- Final val JEPA loss: 0.7691185149279508
- Collapse valid: True

## Frozen Probe

- train: accuracy=0.49970845481049564 pairs=1715 lift=-0.0005830903790087216
- val: accuracy=0.5 pairs=234 lift=0.0
- test: accuracy=0.49765258215962443 pairs=213 lift=-0.004694835680751186

## Comparison

- B0 test accuracy: 0.7652582159624414
- Metrics-only test accuracy: 0.8591549295774648

## Warnings

- M1 is a valid baseline candidate only if non-collapsed; it does not need to beat DINOv2 B0.
