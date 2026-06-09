import { mkdtemp, readFile } from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { getPatchQualityFixtureCount, runPatchQualityEval } from "../patch-quality-eval";

describe("patch quality eval harness", () => {
  it("defines the beta.1 fixture set size", () => {
    expect(getPatchQualityFixtureCount()).toBeGreaterThanOrEqual(20);
    expect(getPatchQualityFixtureCount()).toBeLessThanOrEqual(30);
  });

  it("writes metrics and report artifacts for a focused fixture run", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "openpawl-eval-"));
    const result = await runPatchQualityEval({
      outDir: path.join(tmpDir, "eval-output"),
      limit: 3,
    });

    expect(result.caseCount).toBe(3);
    expect(result.failCount).toBe(0);
    expect(result.passCount).toBe(3);
    expect(result.metricRates.usefulReport).toBe(1);
    expect(result.metricsPath).toContain("metrics.json");
    expect(result.reportPath).toContain("report.md");

    const metrics = JSON.parse(await readFile(result.metricsPath, "utf-8")) as {
      fixtures: ReadonlyArray<{ fixtureId: string; passed: boolean }>;
    };
    expect(metrics.fixtures).toHaveLength(3);
    expect(metrics.fixtures.every((fixture) => fixture.passed)).toBe(true);

    const report = await readFile(result.reportPath, "utf-8");
    expect(report).toContain("Openpawl Patch Quality Eval");
    expect(report).toContain("safe-write-1");
  });
});
