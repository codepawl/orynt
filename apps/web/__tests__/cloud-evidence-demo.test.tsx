import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  CloudEvidenceDemo,
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
    expect(screen.getByText(/Future intake is designed around six Openpawl v1 artifacts only/i)).toBeTruthy();
  });

  test("keeps Cloud copy safe and avoids real-user data intake claims", () => {
    render(<CloudEvidenceDemo />);

    expect(screen.getByText(/static demo fixtures only/i)).toBeTruthy();
    expect(screen.getAllByText(/no customer artifact intake/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/no billing/i)).toBeTruthy();
    expect(screen.getByText(/no organization RBAC/i)).toBeTruthy();
    expect(screen.getByText(/no production Cloud provisioning/i)).toBeTruthy();
    expect(screen.getByText(/Upload controls are not enabled/i)).toBeTruthy();
    expect(screen.queryByText(/upload your artifacts/i)).toBeNull();
    expect(screen.queryByText(/start a free trial/i)).toBeNull();
  });
});
