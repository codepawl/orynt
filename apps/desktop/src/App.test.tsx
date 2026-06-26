import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("CodePawl desktop shell", () => {
  it("renders the repository run cockpit with core control primitives", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Run cockpit" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary app navigation" })).toHaveTextContent("Run");
    expect(screen.getByRole("complementary", { name: "Task sidebar" })).toHaveTextContent("Fix a failing unit test");

    const timeline = screen.getByRole("region", { name: "Run timeline" });
    expect(within(timeline).getByText("run started")).toBeInTheDocument();
    expect(within(timeline).getByText("sandbox planned")).toBeInTheDocument();
    expect(within(timeline).getByText("codex contract created")).toBeInTheDocument();
    expect(within(timeline).getByText("approval required")).toBeInTheDocument();
    expect(within(timeline).getByText("policy violation")).toBeInTheDocument();
    expect(within(timeline).getByText("verification planned")).toBeInTheDocument();
    expect(within(timeline).getByText("verification recorded")).toBeInTheDocument();

    const inspector = screen.getByRole("complementary", { name: "Run inspector" });
    expect(within(inspector).getByText("Safe")).toBeInTheDocument();
    expect(within(inspector).getByText("$0.00 / $1.00")).toBeInTheDocument();
    expect(within(inspector).getByText("26 events")).toBeInTheDocument();
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
});
