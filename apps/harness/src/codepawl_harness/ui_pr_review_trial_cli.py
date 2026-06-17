"""CLI for local real PR/change visual review trials."""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

from codepawl_harness.ui_jepa_scale_gate_cli import main as scale_gate_main
from codepawl_harness.ui_pr_review_ci_cli import PrReviewCiConfig, build_scale_gate_args
from pawlbench_design.ui_pr_review import PrReviewTrialConfig, run_pr_review_trial


@dataclass(frozen=True)
class PrReviewTrialCliConfig:
    trial_root: Path = Path("data/pr_review_v0/real_pr_trial")
    output_dir: Path = Path("reports/ui_pr_review_v0/real_pr_trial")
    reviewer_id: str = "trial"
    gate_case_id: str = ""
    gate_out: Path = Path("reports/ui_pr_review_v0/real_pr_trial/scale_gate_pr_review.json")
    skip_gate: bool = False


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ui-pr-review-trial",
        description="Run a local 5-10 case real PR visual review trial and aggregate reviewer agreement.",
    )
    parser.add_argument("--trial-root", default=str(PrReviewTrialCliConfig.trial_root))
    parser.add_argument("--out", default=str(PrReviewTrialCliConfig.output_dir))
    parser.add_argument("--reviewer-id", default=PrReviewTrialCliConfig.reviewer_id)
    parser.add_argument("--gate-case-id", default="", help="Case id whose PR report should feed the pr-review gate. Defaults to first gate-ready case.")
    parser.add_argument("--gate-out", default=str(PrReviewTrialCliConfig.gate_out))
    parser.add_argument("--skip-gate", action="store_true", help="Only run/aggregate the trial; useful for schema tests.")
    return parser


def config_from_args(args: argparse.Namespace) -> PrReviewTrialCliConfig:
    return PrReviewTrialCliConfig(
        trial_root=Path(args.trial_root),
        output_dir=Path(args.out),
        reviewer_id=args.reviewer_id,
        gate_case_id=args.gate_case_id,
        gate_out=Path(args.gate_out),
        skip_gate=args.skip_gate,
    )


def select_trial_gate_report(trial_report: dict[str, object], gate_case_id: str = "") -> Path | None:
    items = trial_report.get("artifact_paths") if isinstance(trial_report, dict) else None
    if not isinstance(items, list):
        return None
    for item in items:
        if not isinstance(item, dict) or item.get("skipped"):
            continue
        if gate_case_id and item.get("case_id") != gate_case_id:
            continue
        artifact_paths = item.get("artifact_paths") or {}
        report = artifact_paths.get("pr_review_report_json") if isinstance(artifact_paths, dict) else None
        if report:
            return Path(str(report))
    return None


def main(argv: list[str] | None = None) -> int:
    config = config_from_args(build_parser().parse_args(argv))
    try:
        report = run_pr_review_trial(
            PrReviewTrialConfig(
                trial_root=config.trial_root,
                output_dir=config.output_dir,
                reviewer_id=config.reviewer_id,
            )
        )
    except Exception as exc:
        print(f"ui-pr-review-trial: trial run failed: {exc}", file=sys.stderr)
        return 2

    print(f"Wrote real PR trial report to {Path(report['output_dir']) / 'trial_report.json'}")
    print(f"readiness: {report['readiness_decision']}")
    if config.skip_gate:
        return 0 if report.get("valid") else 1

    gate_report = select_trial_gate_report(report, config.gate_case_id)
    if gate_report is None:
        print("ui-pr-review-trial: no gate-ready PR review report found in trial artifacts", file=sys.stderr)
        return 1
    gate_config = PrReviewCiConfig(gate_out=config.gate_out)
    gate_code = scale_gate_main(build_scale_gate_args(gate_config, gate_report))
    if gate_code != 0:
        print("ui-pr-review-trial: pr-review target gate failed", file=sys.stderr)
        return gate_code
    print(f"PR-review target gate report: {config.gate_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
