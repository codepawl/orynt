import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

describe("CodePawl desktop shell", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders the repository run cockpit with core control primitives", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Run cockpit" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary app navigation" })).toHaveTextContent("Run");
    expect(screen.getByRole("complementary", { name: "Task sidebar" })).toHaveTextContent("Fix a failing unit test");

    const timeline = screen.getByRole("region", { name: "Run timeline" });
    expect(within(timeline).getByText("run started")).toBeInTheDocument();
    expect(within(timeline).getByText("budget initialized")).toBeInTheDocument();
    expect(within(timeline).getByText("sandbox planned")).toBeInTheDocument();
    expect(within(timeline).getByText("workspace initialized")).toBeInTheDocument();
    expect(within(timeline).getByText("context packet created")).toBeInTheDocument();
    expect(within(timeline).getByText("codex contract created")).toBeInTheDocument();
    expect(within(timeline).getByText("codex result import requested")).toBeInTheDocument();
    expect(within(timeline).getByText("codex sandbox diff inspected")).toBeInTheDocument();
    expect(within(timeline).getByText("codex result imported")).toBeInTheDocument();
    expect(within(timeline).getByText("verifier input created")).toBeInTheDocument();
    expect(within(timeline).getByText("approval required")).toBeInTheDocument();
    expect(within(timeline).getByText("policy violation")).toBeInTheDocument();
    expect(within(timeline).getByText("verification planned")).toBeInTheDocument();
    expect(within(timeline).getByText("verification recorded")).toBeInTheDocument();
    expect(within(timeline).getByText("memory extraction started")).toBeInTheDocument();
    expect(within(timeline).getByText("memory episode written")).toBeInTheDocument();
    expect(within(timeline).getByText("candidate rule proposed")).toBeInTheDocument();
    expect(within(timeline).getByText("memory extraction finished")).toBeInTheDocument();

    const inspector = screen.getByRole("complementary", { name: "Run inspector" });
    expect(within(inspector).getByText("Safe")).toBeInTheDocument();
    expect(within(inspector).getByText("$0.00 / $1.00")).toBeInTheDocument();
    expect(within(inspector).getByText("46 events")).toBeInTheDocument();
    expect(within(inspector).getByText("Latest verdict: pass")).toBeInTheDocument();
  });

  it("streams a mock run event through the client before live sidecar work exists", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Run task" }));

    expect(await screen.findByText(/mock repository run started/i)).toBeInTheDocument();
    expect(screen.getByText(/run_event: run_finished/i)).toBeInTheDocument();
  });

  it("keeps future surfaces blocked in the P0 shell", () => {
    render(<App />);

    const surfaces = screen.getByRole("region", { name: "Allowed surfaces" });
    const surfaceRows = within(surfaces).getAllByRole("listitem");
    expect(surfaceRows.map((row) => row.textContent)).toEqual([
      "Repositoryenabled",
      "Browserblocked",
      "Desktopblocked",
      "Filesblocked",
      "Terminalblocked",
    ]);
  });

  it("records approval decisions in the mock cockpit state", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Approve step" }));

    expect(await screen.findByText("Approval approved for approval-submit-1")).toBeInTheDocument();
  });

  it("renders the memory review panel with latest episode, namespace, provenance, and candidate evidence", async () => {
    render(<App />);

    const panel = await screen.findByRole("region", { name: "Memory review" });
    expect(within(panel).getByRole("heading", { name: "Memory review" })).toBeInTheDocument();
    expect(within(panel).getByText(/latest successful run episode/i)).toBeInTheDocument();
    expect(within(panel).getByText("coding-apprentice / workspace-local-alpha")).toBeInTheDocument();
    expect(within(panel).getAllByText(/run-1/).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Candidate").length).toBeGreaterThan(0);
    expect(within(panel).getByText("allowed_scope_pattern")).toBeInTheDocument();
    expect(within(panel).getByText("86% confidence")).toBeInTheDocument();
  });

  it("accepts, rejects, and supersedes candidate rules with visible timeline events", async () => {
    const firstRender = render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Accept Keep package fixes scoped" }));
    expect(await screen.findByText("Accepted")).toBeInTheDocument();
    expect(await screen.findByText(/run_event: candidate_rule_accepted/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Promote Keep package fixes scoped" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reject Avoid secret-bearing logs" }));
    expect(await screen.findByText("Rejected")).toBeInTheDocument();
    expect(await screen.findByText(/run_event: candidate_rule_rejected/)).toBeInTheDocument();

    firstRender.unmount();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark superseded Keep package fixes scoped" }));
    expect(await screen.findByText("Superseded")).toBeInTheDocument();
    expect(await screen.findByText(/run_event: candidate_rule_superseded/)).toBeInTheDocument();
  });

  it("copies only redacted rule text and never renders raw sensitive values", async () => {
    render(<App />);

    expect(screen.queryByText(/sk-memorysecret123/)).not.toBeInTheDocument();
    expect((await screen.findAllByText(/\[REDACTED\]/)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Copy Avoid secret-bearing logs" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("[REDACTED]"));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith(expect.stringContaining("sk-memorysecret123"));
  });

  it("renders candidate skills with provenance, evidence, validation, and no auto-run controls", async () => {
    render(<App />);

    const panel = await screen.findByRole("region", { name: "Skill registry" });
    expect(within(panel).getByRole("heading", { name: "Skill registry" })).toBeInTheDocument();
    expect(within(panel).getAllByText("Candidate").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Keep package fixes scoped")).toBeInTheDocument();
    expect(within(panel).getByText(/candidate-rule-package-scope/)).toBeInTheDocument();
    expect(within(panel).getByText(/episode-latest-successful-run/)).toBeInTheDocument();
    expect(within(panel).getAllByText(/pnpm test:contracts/).length).toBeGreaterThan(0);
    expect(within(panel).getByText(/automatic_execution/)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /run skill/i })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /replay/i })).not.toBeInTheDocument();
  });

  it("promotes, rejects, and archives skills manually with visible timeline events", async () => {
    const firstRender = render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Promote manually Keep package fixes scoped" }));
    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(await screen.findByText(/run_event: skill_promoted_manual/)).toBeInTheDocument();

    firstRender.unmount();
    const secondRender = render(<App />);
    const rejectPanel = await screen.findByRole("region", { name: "Skill registry" });
    fireEvent.click(within(rejectPanel).getByRole("button", { name: "Reject Keep package fixes scoped" }));
    expect(await screen.findByText("Rejected")).toBeInTheDocument();
    expect(await screen.findByText(/run_event: skill_rejected/)).toBeInTheDocument();

    secondRender.unmount();
    render(<App />);
    const archivePanel = await screen.findByRole("region", { name: "Skill registry" });
    fireEvent.click(within(archivePanel).getByRole("button", { name: "Archive Keep package fixes scoped" }));
    expect(await screen.findByText("Archived")).toBeInTheDocument();
    expect(await screen.findByText(/run_event: skill_archived/)).toBeInTheDocument();
  });

  it("copies only redacted skill summaries", async () => {
    render(<App />);

    const panel = await screen.findByRole("region", { name: "Skill registry" });
    expect(within(panel).queryByText(/sk-skillsecret123/)).not.toBeInTheDocument();
    expect(within(panel).getAllByText(/\[REDACTED\]/).length).toBeGreaterThan(0);

    fireEvent.click(within(panel).getByRole("button", { name: "Copy skill summary Keep package fixes scoped" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("[REDACTED]"));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith(expect.stringContaining("sk-skillsecret123"));
  });
});
