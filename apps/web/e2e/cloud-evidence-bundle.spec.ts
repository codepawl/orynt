import { expect, test } from "@playwright/test";

import {
  SYNTHETIC_OPENPAWL_RUN_ID,
  syntheticOpenpawlEvidenceBundle,
} from "./fixtures/openpawl-evidence-bundle";

async function openCloudEvidence(page: import("@playwright/test").Page) {
  await page.goto("/cloud/evidence", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("browser-only preview")).toBeVisible();
}

async function validateBundle(page: import("@playwright/test").Page, bundle: unknown) {
  await page.getByLabel("Local artifact JSON bundle").fill(JSON.stringify(bundle));
  await page.getByRole("button", { name: "Validate local preview" }).click();
}

test.describe("Cloud Evidence Openpawl bundle preview", () => {
  test("renders Evidence Summary from a synthetic Openpawl evidence bundle", async ({ page }) => {
    await openCloudEvidence(page);
    await validateBundle(page, syntheticOpenpawlEvidenceBundle);

    await expect(page.getByText("Valid local artifact preview")).toBeVisible();
    await expect(page.getByText("Local run summary")).toBeVisible();
    expect(await page.getByText(SYNTHETIC_OPENPAWL_RUN_ID).count()).toBeGreaterThan(0);
    await expect(page.getByText("Openpawl local bundle generated 2026-06-12T00:00:00.000Z")).toBeVisible();
    await expect(page.getByText("1 calls")).toBeVisible();
    await expect(page.locator("#report-demo").getByText("Synthetic CP-005 fixture only.")).toBeVisible();
    await expect(page.getByText(/It has not been uploaded, stored, or shared with CodePawl/i)).toBeVisible();
  });

  test("rejects malformed Openpawl bundle metadata", async ({ page }) => {
    const { generatedAt: _generatedAt, ...malformedBundle } = syntheticOpenpawlEvidenceBundle;

    await openCloudEvidence(page);
    await validateBundle(page, malformedBundle);

    await expect(page.getByText("Preview validation failed")).toBeVisible();
    await expect(page.getByText("missing_bundle_metadata")).toBeVisible();
    await expect(page.getByText("openpawl-evidence-bundle.json must include generatedAt.")).toBeVisible();
  });

  test("rejects mismatched nested Openpawl run IDs", async ({ page }) => {
    await openCloudEvidence(page);
    await validateBundle(page, {
      ...syntheticOpenpawlEvidenceBundle,
      artifacts: {
        ...syntheticOpenpawlEvidenceBundle.artifacts,
        "patch-plan.json": {
          ...syntheticOpenpawlEvidenceBundle.artifacts["patch-plan.json"],
          runId: "run_mismatched_nested_artifact",
        },
      },
    });

    await expect(page.getByText("Preview validation failed")).toBeVisible();
    await expect(page.getByText("patch-plan.json / run_id_mismatch")).toBeVisible();
    await expect(page.getByText("patch-plan.json runId must match run.json runId.")).toBeVisible();
  });
});
