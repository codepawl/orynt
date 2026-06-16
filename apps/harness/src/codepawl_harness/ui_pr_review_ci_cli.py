"""CI-safe wrapper for PR screenshot review artifact generation."""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

from codepawl_harness.ui_jepa_scale_gate_cli import main as scale_gate_main
from pawlbench_design.ui_pr_review import PrReviewPilotConfig, run_pr_review_pilot, validate_pr_review_ci_artifacts


@dataclass(frozen=True)
class PrReviewCiConfig:
    pilot_config: Path = Path("data/pr_review_v0/codepawl_web_pilot/metadata.json")
    output_dir: Path = Path("reports/ui_pr_review_v0/codepawl_web_pilot")
    reviewer_id: str = "ci"
    gate_review_id: str = "docs_api_reference_contrast"
    gate_out: Path = Path("reports/ui_jepa_v0_smoke/scale_gate_pr_review.json")
    dataset: Path = Path("data/processed/ui_jepa_v0_smoke")
    b0_report: Path = Path("reports/ui_jepa_v0_smoke/b0_report.json")
    m1_report: Path = Path("reports/ui_jepa_v0_smoke/m1_report.json")
    m2_report: Path = Path("reports/ui_jepa_v0_smoke/m2_report.json")
    m25_report: Path = Path("reports/ui_jepa_v0_smoke/m25_diagnostics_report.json")
    m2_strong_report: Path = Path("reports/ui_jepa_v0_smoke/m2_strong_report.json")
    preference_critic_report: Path = Path("reports/ui_jepa_v0_smoke/preference_critic_report.json")
    closed_loop_report: Path = Path("reports/ui_loop_v0_mixed_deterministic/closed_loop_report.json")
    manual_batch_report: Path = Path("reports/ui_loop_v0_manual_batch/combined_manual_patch_report.json")
    validate_only: bool = False


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ui-pr-review-ci",
        description="Run or validate the CI artifact contract for local PR screenshot review.",
    )
    parser.add_argument("--pilot-config", default=str(PrReviewCiConfig.pilot_config))
    parser.add_argument("--out", default=str(PrReviewCiConfig.output_dir))
    parser.add_argument("--reviewer-id", default=PrReviewCiConfig.reviewer_id)
    parser.add_argument("--gate-review-id", default=PrReviewCiConfig.gate_review_id)
    parser.add_argument("--gate-out", default=str(PrReviewCiConfig.gate_out))
    parser.add_argument("--dataset", default=str(PrReviewCiConfig.dataset))
    parser.add_argument("--b0-report", default=str(PrReviewCiConfig.b0_report))
    parser.add_argument("--m1-report", default=str(PrReviewCiConfig.m1_report))
    parser.add_argument("--m2-report", default=str(PrReviewCiConfig.m2_report))
    parser.add_argument("--m25-report", default=str(PrReviewCiConfig.m25_report))
    parser.add_argument("--m2-strong-report", default=str(PrReviewCiConfig.m2_strong_report))
    parser.add_argument("--preference-critic-report", default=str(PrReviewCiConfig.preference_critic_report))
    parser.add_argument("--closed-loop-report", default=str(PrReviewCiConfig.closed_loop_report))
    parser.add_argument("--manual-batch-report", default=str(PrReviewCiConfig.manual_batch_report))
    parser.add_argument("--validate-only", action="store_true", help="Validate existing artifacts without rerunning review or gate.")
    return parser


def config_from_args(args: argparse.Namespace) -> PrReviewCiConfig:
    return PrReviewCiConfig(
        pilot_config=Path(args.pilot_config),
        output_dir=Path(args.out),
        reviewer_id=args.reviewer_id,
        gate_review_id=args.gate_review_id,
        gate_out=Path(args.gate_out),
        dataset=Path(args.dataset),
        b0_report=Path(args.b0_report),
        m1_report=Path(args.m1_report),
        m2_report=Path(args.m2_report),
        m25_report=Path(args.m25_report),
        m2_strong_report=Path(args.m2_strong_report),
        preference_critic_report=Path(args.preference_critic_report),
        closed_loop_report=Path(args.closed_loop_report),
        manual_batch_report=Path(args.manual_batch_report),
        validate_only=args.validate_only,
    )


def build_scale_gate_args(config: PrReviewCiConfig, pr_review_report: Path) -> list[str]:
    return [
        "--target",
        "pr-review",
        "--dataset",
        str(config.dataset),
        "--b0-report",
        str(config.b0_report),
        "--m1-report",
        str(config.m1_report),
        "--m2-report",
        str(config.m2_report),
        "--m25-report",
        str(config.m25_report),
        "--m2-strong-report",
        str(config.m2_strong_report),
        "--preference-critic-report",
        str(config.preference_critic_report),
        "--closed-loop-report",
        str(config.closed_loop_report),
        "--manual-batch-report",
        str(config.manual_batch_report),
        "--pr-review-report",
        str(pr_review_report),
        "--out",
        str(config.gate_out),
    ]


def select_gate_pr_review_report(config: PrReviewCiConfig) -> Path:
    preferred = config.output_dir / config.gate_review_id / "pr_review_report.json"
    if preferred.is_file():
        return preferred
    pilot_report = config.output_dir / "pilot_report.json"
    if pilot_report.is_file():
        import json

        payload = json.loads(pilot_report.read_text(encoding="utf-8"))
        for item in payload.get("artifact_paths") or []:
            if item.get("skipped"):
                continue
            artifact_paths = item.get("artifact_paths") or {}
            report = artifact_paths.get("pr_review_report_json")
            if report:
                return Path(report)
    return preferred


def main(argv: list[str] | None = None) -> int:
    config = config_from_args(build_parser().parse_args(argv))
    if not config.validate_only:
        try:
            pilot = run_pr_review_pilot(
                PrReviewPilotConfig(
                    config_path=config.pilot_config,
                    output_dir=config.output_dir,
                    reviewer_id=config.reviewer_id,
                )
            )
        except Exception as exc:
            print(f"ui-pr-review-ci: PR review pilot failed: {exc}", file=sys.stderr)
            return 2
        print(f"PR review pilot artifacts: {Path(pilot['output_dir'])}")
        gate_report = select_gate_pr_review_report(config)
        gate_code = scale_gate_main(build_scale_gate_args(config, gate_report))
        if gate_code != 0:
            print("ui-pr-review-ci: pr-review target gate failed", file=sys.stderr)
            return gate_code

    validation = validate_pr_review_ci_artifacts(config.output_dir, config.gate_out)
    if not validation["valid"]:
        for error in validation["errors"]:
            print(f"artifact contract error: {error}", file=sys.stderr)
        return 1

    print(f"PR visual review artifacts are valid: {validation['artifact_dir']}")
    print(f"Gate report: {validation['scale_gate_report']}")
    print("Next: upload the artifact directory for human inspection; keep required checks and bot posting disabled.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
