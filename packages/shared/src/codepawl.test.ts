import { describe, expect, it } from "vitest";

import { MVP_BLOCKED_SURFACES, createMockRunState, isExecutableMvpSurface } from "./index";

describe("CodePawl shared product contracts", () => {
  it("treats browser as the only executable MVP surface", () => {
    expect(isExecutableMvpSurface("browser")).toBe(true);
    expect(MVP_BLOCKED_SURFACES).toEqual(["desktop", "files", "terminal"]);
    expect(isExecutableMvpSurface("desktop")).toBe(false);
    expect(isExecutableMvpSurface("files")).toBe(false);
    expect(isExecutableMvpSurface("terminal")).toBe(false);
  });

  it("builds a typed mock run state with core primitives visible", () => {
    const state = createMockRunState();

    expect(state.workspace.plan).toBe("trial");
    expect(state.activeTask.surface).toBe("browser");
    expect(state.activeTask.status).toBe("waiting_approval");
    expect(state.steps.map((step) => step.type)).toEqual(["observe", "plan", "act", "approval", "verify"]);
    expect(state.permissionPolicy.askBefore).toContain("submit");
    expect(state.usageBudget.runLimitUsd).toBeGreaterThan(0);
    expect(state.traceSummary.observationGraphNodes).toBeGreaterThan(0);
    expect(state.skillDraft.replayModelCalls).toBe(0);
  });
});
