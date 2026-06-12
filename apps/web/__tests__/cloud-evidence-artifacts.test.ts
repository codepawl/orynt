import { describe, expect, test } from "vitest";

import {
  DEMO_EVIDENCE_ARTIFACT_SET,
  DEMO_OPENPAWL_EVIDENCE_BUNDLE,
} from "../components/marketing/cloud-evidence-demo";
import {
  parseCloudEvidenceArtifactBundle,
  validateCloudEvidenceArtifactSet,
} from "../lib/cloud-evidence-artifacts";

describe("validateCloudEvidenceArtifactSet", () => {
  test("accepts a valid artifact set", () => {
    const result = validateCloudEvidenceArtifactSet(DEMO_EVIDENCE_ARTIFACT_SET);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected valid demo artifact set");
    expect(result.runId).toBe(DEMO_EVIDENCE_ARTIFACT_SET["run.json"].runId);
    expect(result.schemaVersion).toBe("1");
  });

  test("rejects a missing required artifact", () => {
    const { "trace.json": _trace, ...missingTrace } = DEMO_EVIDENCE_ARTIFACT_SET;
    const result = validateCloudEvidenceArtifactSet(missingTrace);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected missing artifact rejection");
    expect(result.status).toBe("rejected");
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "missing_required_artifact",
        artifact: "trace.json",
      }),
    );
  });

  test("rejects the wrong schemaVersion", () => {
    const result = validateCloudEvidenceArtifactSet({
      ...DEMO_EVIDENCE_ARTIFACT_SET,
      "run.json": {
        ...DEMO_EVIDENCE_ARTIFACT_SET["run.json"],
        schemaVersion: "2",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected schemaVersion rejection");
    expect(result.status).toBe("rejected");
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "wrong_schema_version",
        artifact: "run.json",
      }),
    );
  });

  test("blocks unsafe-looking payload text", () => {
    const result = validateCloudEvidenceArtifactSet({
      ...DEMO_EVIDENCE_ARTIFACT_SET,
      "report.md": "Evidence Summary\n\napi_key=sk_live_1234567890abcdef1234567890",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected unsafe payload block");
    expect(result.status).toBe("blocked");
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "unsafe_payload_text",
        artifact: "report.md",
      }),
    );
  });

  test("parses a valid local preview JSON bundle", () => {
    const result = parseCloudEvidenceArtifactBundle(JSON.stringify(DEMO_EVIDENCE_ARTIFACT_SET));

    expect(result.ok).toBe(true);
  });

  test("parses a valid Openpawl evidence bundle", () => {
    const result = parseCloudEvidenceArtifactBundle(JSON.stringify(DEMO_OPENPAWL_EVIDENCE_BUNDLE));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected valid Openpawl evidence bundle");
    expect(result.runId).toBe(DEMO_OPENPAWL_EVIDENCE_BUNDLE.runId);
    expect(result.bundle).toEqual({
      bundleVersion: "1",
      generatedAt: DEMO_OPENPAWL_EVIDENCE_BUNDLE.generatedAt,
      runId: DEMO_OPENPAWL_EVIDENCE_BUNDLE.runId,
      artifactSchemaVersion: "1",
      source: "openpawl",
    });
  });

  test("rejects an Openpawl bundle with missing metadata", () => {
    const { bundleVersion: _bundleVersion, ...missingBundleVersion } =
      DEMO_OPENPAWL_EVIDENCE_BUNDLE;
    const result = parseCloudEvidenceArtifactBundle(JSON.stringify(missingBundleVersion));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected missing bundle metadata rejection");
    expect(result.status).toBe("rejected");
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "missing_bundle_metadata",
      }),
    );
  });

  test("rejects an Openpawl bundle with wrong artifactSchemaVersion", () => {
    const result = parseCloudEvidenceArtifactBundle(
      JSON.stringify({
        ...DEMO_OPENPAWL_EVIDENCE_BUNDLE,
        artifactSchemaVersion: "2",
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected artifactSchemaVersion rejection");
    expect(result.status).toBe("rejected");
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "wrong_schema_version",
        artifact: "artifactSchemaVersion",
      }),
    );
  });

  test("rejects an Openpawl bundle with a missing nested artifact", () => {
    const { "trace.json": _trace, ...missingTrace } = DEMO_EVIDENCE_ARTIFACT_SET;
    const result = parseCloudEvidenceArtifactBundle(
      JSON.stringify({
        ...DEMO_OPENPAWL_EVIDENCE_BUNDLE,
        artifacts: missingTrace,
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected missing nested artifact rejection");
    expect(result.status).toBe("rejected");
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "missing_required_artifact",
        artifact: "trace.json",
      }),
    );
  });

  test("rejects an Openpawl bundle with mismatched nested run IDs", () => {
    const result = parseCloudEvidenceArtifactBundle(
      JSON.stringify({
        ...DEMO_OPENPAWL_EVIDENCE_BUNDLE,
        artifacts: {
          ...DEMO_OPENPAWL_EVIDENCE_BUNDLE.artifacts,
          "patch-plan.json": {
            ...DEMO_OPENPAWL_EVIDENCE_BUNDLE.artifacts["patch-plan.json"],
            runId: "run_mismatch",
          },
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected nested run ID mismatch rejection");
    expect(result.status).toBe("rejected");
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "run_id_mismatch",
        artifact: "patch-plan.json",
      }),
    );
  });

  test("rejects invalid local preview JSON bundle text", () => {
    const result = parseCloudEvidenceArtifactBundle("{not json");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parse rejection");
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_json",
      }),
    );
  });
});
