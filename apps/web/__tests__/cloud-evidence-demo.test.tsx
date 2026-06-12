import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  CloudEvidenceDemo,
  DEMO_EVIDENCE_ARTIFACT_SET,
  DEMO_OPENPAWL_EVIDENCE_BUNDLE,
  DEMO_EVIDENCE_RUN,
} from "../components/marketing/cloud-evidence-demo";

describe("CloudEvidenceDemo", () => {
  test("renders the read-only Evidence Hub skeleton from static demo artifacts", () => {
    render(<CloudEvidenceDemo />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Read-only evidence review for Openpawl runs.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "CodePawl Cloud Evidence Hub is upcoming. This demo shows the intended artifact review experience.",
      ),
    ).toBeTruthy();
    expect(screen.getAllByText(DEMO_EVIDENCE_RUN.runId).length).toBeGreaterThan(0);
    expect(screen.getAllByText("schemaVersion").length).toBeGreaterThan(0);
    expect(screen.getAllByText("report.md").length).toBeGreaterThan(0);
    expect(screen.getAllByText("trace.json").length).toBeGreaterThan(0);
    expect(screen.getAllByText("run.json").length).toBeGreaterThan(0);
    expect(screen.getByText(/accepts Openpawl/i)).toBeTruthy();
    expect(screen.getAllByText(/v0\.5\.3\+/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/openpawl-evidence-bundle\.json/i).length).toBeGreaterThan(0);
  });

  test("keeps Cloud copy safe and avoids real-user data intake claims", () => {
    render(<CloudEvidenceDemo />);

    expect(screen.getByText(/static demo fixtures only/i)).toBeTruthy();
    expect(screen.getByText(/no server-side artifact upload/i)).toBeTruthy();
    expect(screen.getByText(/no customer artifact storage/i)).toBeTruthy();
    expect(screen.getByText(/no billing/i)).toBeTruthy();
    expect(screen.getByText(/no organization RBAC/i)).toBeTruthy();
    expect(screen.getByText(/no production Cloud provisioning/i)).toBeTruthy();
    expect(screen.getByText(/Upload controls are not enabled/i)).toBeTruthy();
    expect(screen.getByText(/Local preview only. Artifact contents are not uploaded or stored./i)).toBeTruthy();
    expect(screen.queryByText(/upload your artifacts/i)).toBeNull();
    expect(screen.queryByText(/start a free trial/i)).toBeNull();
  });

  test("previews a valid Openpawl artifact bundle locally", () => {
    render(<CloudEvidenceDemo />);

    fireEvent.change(screen.getByLabelText("Local artifact JSON bundle"), {
      target: { value: JSON.stringify(DEMO_OPENPAWL_EVIDENCE_BUNDLE) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate local preview" }));

    expect(screen.getByText("Valid local artifact preview")).toBeTruthy();
    expect(screen.getByText(/accepted locally/i)).toBeTruthy();
    expect(screen.getAllByText(DEMO_EVIDENCE_RUN.runId).length).toBeGreaterThan(0);
    expect(screen.getByText(/Openpawl local bundle generated/i)).toBeTruthy();
    expect(screen.getByText(/It has not been uploaded, stored, or shared with CodePawl/i)).toBeTruthy();
  });

  test("shows missing Openpawl bundle metadata rejection reasons", () => {
    const { generatedAt: _generatedAt, ...missingGeneratedAt } = DEMO_OPENPAWL_EVIDENCE_BUNDLE;
    render(<CloudEvidenceDemo />);

    fireEvent.change(screen.getByLabelText("Local artifact JSON bundle"), {
      target: { value: JSON.stringify(missingGeneratedAt) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate local preview" }));

    expect(screen.getByText("Preview validation failed")).toBeTruthy();
    expect(screen.getByText(/missing_bundle_metadata/i)).toBeTruthy();
    expect(screen.getByText(/must include generatedAt/i)).toBeTruthy();
  });

  test("shows wrong schemaVersion preview rejection reasons", () => {
    render(<CloudEvidenceDemo />);

    fireEvent.change(screen.getByLabelText("Local artifact JSON bundle"), {
      target: {
        value: JSON.stringify({
          ...DEMO_EVIDENCE_ARTIFACT_SET,
          "run.json": {
            ...DEMO_EVIDENCE_ARTIFACT_SET["run.json"],
            schemaVersion: "2",
          },
        }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate local preview" }));

    expect(screen.getByText("Preview validation failed")).toBeTruthy();
    expect(screen.getByText(/run.json \/ wrong_schema_version/i)).toBeTruthy();
    expect(screen.getByText(/run.json must use schemaVersion 1/i)).toBeTruthy();
  });

  test("shows missing required artifact preview rejection reasons", () => {
    const { "trace.json": _trace, ...missingTrace } = DEMO_EVIDENCE_ARTIFACT_SET;
    render(<CloudEvidenceDemo />);

    fireEvent.change(screen.getByLabelText("Local artifact JSON bundle"), {
      target: { value: JSON.stringify(missingTrace) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate local preview" }));

    expect(screen.getByText("Preview validation failed")).toBeTruthy();
    expect(screen.getByText(/trace.json \/ missing_required_artifact/i)).toBeTruthy();
    expect(screen.getByText(/trace.json is required/i)).toBeTruthy();
  });

  test("blocks unsafe-looking preview payload text", () => {
    render(<CloudEvidenceDemo />);

    fireEvent.change(screen.getByLabelText("Local artifact JSON bundle"), {
      target: {
        value: JSON.stringify({
          ...DEMO_EVIDENCE_ARTIFACT_SET,
          "report.md": "Evidence Summary\n\napi_key=sk_live_1234567890abcdef1234567890",
        }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate local preview" }));

    expect(screen.getByText("Preview validation failed")).toBeTruthy();
    expect(screen.getByText(/blocked/i)).toBeTruthy();
    expect(screen.getByText(/report.md \/ unsafe_payload_text/i)).toBeTruthy();
    expect(screen.getByText(/must be redacted before intake/i)).toBeTruthy();
  });
});
