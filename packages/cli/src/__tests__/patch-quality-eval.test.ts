import { mkdtemp, readFile } from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  getPatchQualityExpectedMetricRates,
  getPatchQualityFailureCategories,
  getPatchQualityFixtureCategoryCounts,
  getPatchQualityFixtureCount,
  runPatchQualityEval,
} from "../patch-quality-eval";

describe("patch quality eval harness", () => {
  it("defines the v0.2 fixture set size and policy coverage", () => {
    expect(getPatchQualityFixtureCount()).toBe(50);
    expect(getPatchQualityFixtureCategoryCounts()).toEqual({
      "safe-write": 20,
      "dry-run": 10,
      unsafe: 6,
      rejected: 6,
      "validation-fail": 4,
      "grounding-edge": 4,
    });
  });

  it("writes metrics and report artifacts for full v0.2 fixture run", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "openpawl-eval-"));
    const expectedRates = getPatchQualityExpectedMetricRates();
    const result = await runPatchQualityEval({
      outDir: path.join(tmpDir, "eval-output"),
      limit: 50,
    });

    expect(result.caseCount).toBe(50);
    expect(result.passCount).toBe(50);
    expect(result.failCount).toBe(0);
    expect(result.metricRates.usefulReport).toBe(expectedRates.usefulReport);
    expect(result.metricRates.acceptedPatch).toBe(expectedRates.acceptedPatch);
    expect(result.metricRates.validationPass).toBe(expectedRates.validationPass);
    expect(result.metricRates.unsafeBlock).toBe(expectedRates.unsafeBlock);
    expect(result.metricRates.irrelevantFileTouch).toBe(expectedRates.irrelevantFileTouch);
    expect(result.metricRates.useful_report_rate).toBe(expectedRates.useful_report_rate);
    expect(result.metricRates.safe_patch_rate).toBe(expectedRates.safe_patch_rate);
    expect(result.metricRates.validation_pass_rate).toBe(expectedRates.validation_pass_rate);
    expect(result.metricRates.no_safe_chunk_rate).toBe(expectedRates.no_safe_chunk_rate);
    expect(result.metricRates.irrelevant_file_touch_rate).toBe(expectedRates.irrelevant_file_touch_rate);
    expect(result.metricRates.fallback_manual_pr_rate).toBe(expectedRates.fallback_manual_pr_rate);
    expect(result.metricRates.fallback_manual_pr_rate_reason).toBe(expectedRates.fallback_manual_pr_rate_reason);
    expect(result.metricsPath).toContain("metrics.json");
    expect(result.reportPath).toContain("report.md");

    const metrics = JSON.parse(await readFile(result.metricsPath, "utf-8")) as {
      caseCount: number;
      passCount: number;
      failCount: number;
      metricRates: {
        usefulReport: number;
        acceptedPatch: number;
        validationPass: number;
        unsafeBlock: number;
        irrelevantFileTouch: number;
        useful_report_rate: number;
        safe_patch_rate: number;
        validation_pass_rate: number;
        no_safe_chunk_rate: number;
        irrelevant_file_touch_rate: number;
        fallback_manual_pr_rate: number | null;
        fallback_manual_pr_rate_reason: "not_applicable_for_patch_quality_fixtures";
        failureModeCounts: {
          safe_patch_missing: number;
          unsafe_patch_allowed: number;
          validation_expected_but_missing: number;
          validation_unexpected: number;
          irrelevant_file_touch: number;
          report_not_useful: number;
          no_safe_chunk_mismatch: number;
          category_expectation_mismatch: number;
        };
      };
      fixtures: ReadonlyArray<{
        fixtureId: string;
        passed: boolean;
        failureCategories: ReadonlyArray<string>;
        failureReasons: ReadonlyArray<string>;
      }>;
    };
    expect(metrics.caseCount).toBe(50);
    expect(metrics.passCount).toBe(50);
    expect(metrics.failCount).toBe(0);
    expect(metrics.metricRates.usefulReport).toBe(expectedRates.usefulReport);
    expect(metrics.metricRates.acceptedPatch).toBe(expectedRates.acceptedPatch);
    expect(metrics.metricRates.validationPass).toBe(expectedRates.validationPass);
    expect(metrics.metricRates.unsafeBlock).toBe(expectedRates.unsafeBlock);
    expect(metrics.metricRates.irrelevantFileTouch).toBe(expectedRates.irrelevantFileTouch);
    expect(metrics.metricRates.useful_report_rate).toBe(expectedRates.useful_report_rate);
    expect(metrics.metricRates.safe_patch_rate).toBe(expectedRates.safe_patch_rate);
    expect(metrics.metricRates.validation_pass_rate).toBe(expectedRates.validation_pass_rate);
    expect(metrics.metricRates.no_safe_chunk_rate).toBe(expectedRates.no_safe_chunk_rate);
    expect(metrics.metricRates.irrelevant_file_touch_rate).toBe(expectedRates.irrelevant_file_touch_rate);
    expect(metrics.metricRates.fallback_manual_pr_rate).toBe(expectedRates.fallback_manual_pr_rate);
    expect(metrics.metricRates.fallback_manual_pr_rate_reason).toBe(expectedRates.fallback_manual_pr_rate_reason);
    expect(metrics.metricRates.failureModeCounts).toEqual({
      safe_patch_missing: 0,
      unsafe_patch_allowed: 0,
      validation_expected_but_missing: 0,
      validation_unexpected: 0,
      irrelevant_file_touch: 0,
      report_not_useful: 0,
      no_safe_chunk_mismatch: 0,
      category_expectation_mismatch: 0,
    });
    expect(metrics.fixtures).toHaveLength(50);
    expect(metrics.fixtures.every((fixture) => fixture.passed)).toBe(true);
    expect(metrics.fixtures.every((fixture) => fixture.failureCategories.length === 0)).toBe(true);
    expect(metrics.fixtures.every((fixture) => fixture.failureReasons.length === 0)).toBe(true);

    const report = await readFile(result.reportPath, "utf-8");
    expect(report).toContain("Openpawl Patch Quality Eval");
    expect(report).toContain("safe-write-01");
    expect(report).toContain("grounding-edge-cross-scope");
    expect(report).toContain("validation-fail-04");
    expect(report).toContain("Safe patch rate");
    expect(report).toContain("Validation pass rate");
    expect(report).toContain("No-safe-chunk rate");
    expect(report).toContain("Fallback/manual PR rate: null");
    expect(report).toContain("Failure categories:");
    expect(report).toContain("Failure modes");
    expect(report).toContain("| Failure modes | Failure reasons |");
  });

  it("keeps common intent safe-write fixtures fully passing", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "openpawl-eval-"));
    const result = await runPatchQualityEval({
      outDir: path.join(tmpDir, "eval-output"),
      limit: 20,
    });

    const commonIntentFixtureIds = [
      "safe-write-01",
      "safe-write-02",
      "safe-write-03",
      "safe-write-04",
      "safe-write-05",
      "safe-write-06",
    ];
    const fixtureById = new Map(result.fixtures.map((fixture) => [fixture.fixtureId, fixture]));
    for (const fixtureId of commonIntentFixtureIds) {
      const fixture = fixtureById.get(fixtureId);
      expect(fixture).toBeDefined();
      expect(fixture?.passed).toBe(true);
      expect(fixture?.acceptedPatch).toBe(true);
      expect(fixture?.validationPass).toBe(true);
      expect(fixture?.unsafeBlock).toBe(false);
      expect(fixture?.noSafeChunk).toBe(false);
      expect(fixture?.failureCategories).toEqual([]);
      expect(fixture?.failureReasons).toEqual([]);
    }
  });

  it("classifies fixture mismatches into stable failure categories", () => {
    const expected = {
      usefulReport: true,
      acceptedPatch: true,
      validationPass: true,
      unsafeBlock: false,
      irrelevantFileTouch: false,
      noSafeChunk: false,
    };

    expect(
      getPatchQualityFailureCategories(expected, {
        usefulReport: false,
        acceptedPatch: false,
        validationPass: false,
        unsafeBlock: false,
        irrelevantFileTouch: false,
        noSafeChunk: false,
      })
    ).toEqual(["safe_patch_missing", "validation_expected_but_missing", "report_not_useful"]);

    expect(
      getPatchQualityFailureCategories(
        { ...expected, acceptedPatch: false, validationPass: false },
        {
          usefulReport: true,
          acceptedPatch: true,
          validationPass: false,
          unsafeBlock: false,
          irrelevantFileTouch: false,
          noSafeChunk: false,
        }
      )
    ).toEqual(["unsafe_patch_allowed"]);

    expect(
      getPatchQualityFailureCategories({ ...expected, noSafeChunk: true }, {
        usefulReport: true,
        acceptedPatch: true,
        validationPass: true,
        unsafeBlock: false,
        irrelevantFileTouch: false,
        noSafeChunk: false,
      })
    ).toEqual(["no_safe_chunk_mismatch"]);

    expect(
      getPatchQualityFailureCategories(
        { ...expected, unsafeBlock: false, acceptedPatch: false, validationPass: true },
        {
          usefulReport: true,
          acceptedPatch: false,
          validationPass: true,
          unsafeBlock: true,
          irrelevantFileTouch: false,
          noSafeChunk: false,
        }
      )
    ).toEqual(["category_expectation_mismatch"]);
  });
});
