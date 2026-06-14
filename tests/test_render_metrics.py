from codepawl_metrics import contrast_ratio, relative_luminance


def test_relative_luminance_known_extremes() -> None:
    assert relative_luminance(0, 0, 0) == 0
    assert relative_luminance(255, 255, 255) == 1


def test_contrast_ratio_known_pairs() -> None:
    assert round(contrast_ratio((0, 0, 0), (255, 255, 255)), 2) == 21.0
    assert round(contrast_ratio((255, 255, 255), (255, 255, 255)), 2) == 1.0
    assert round(contrast_ratio((18, 60, 105), (255, 255, 255)), 2) >= 9
