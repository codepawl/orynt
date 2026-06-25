import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("CodePawl desktop shell", () => {
  it("renders the browser-first run cockpit with core control primitives", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Run cockpit" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary app navigation" })).toHaveTextContent("Run");
    expect(screen.getByRole("complementary", { name: "Task sidebar" })).toHaveTextContent("Research competitor pricing");

    const timeline = screen.getByRole("region", { name: "Run timeline" });
    expect(within(timeline).getByText("Observe pricing page")).toBeInTheDocument();
    expect(within(timeline).getByText("Approval required")).toBeInTheDocument();

    const inspector = screen.getByRole("complementary", { name: "Run inspector" });
    expect(within(inspector).getByText("Safe")).toBeInTheDocument();
    expect(within(inspector).getByText("$0.42 / $1.00")).toBeInTheDocument();
    expect(within(inspector).getByText("17 graph nodes")).toBeInTheDocument();
    expect(within(inspector).getByText("Replay: 0 model calls")).toBeInTheDocument();
  });

  it("streams a mock run event through the client before live sidecar work exists", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Run task" }));

    expect(await screen.findByText(/mock run created/i)).toBeInTheDocument();
    expect(screen.getByText(/run_event: run.step_added/i)).toBeInTheDocument();
  });

  it("keeps future surfaces blocked in the MVP shell", () => {
    render(<App />);

    const surfaces = screen.getByRole("region", { name: "Allowed surfaces" });
    const surfaceRows = within(surfaces).getAllByRole("listitem");
    expect(surfaceRows.map((row) => row.textContent)).toEqual([
      "Browserenabled",
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
