import { describe, it, expect } from "vitest";
import { TraceLedger } from "../ledger/trace";

describe("TraceLedger", () => {
  it("initialises with a trace id", () => {
    const ledger = new TraceLedger("test-trace-001");
    expect(ledger.getTraceId()).toBe("test-trace-001");
  });

  it("records events and returns them in getSummary()", () => {
    const ledger = new TraceLedger("trace-02");
    ledger.start();
    ledger.recordEvent("node_start", "intake", "info", { foo: "bar" });
    ledger.recordEvent("node_end", "intake", "info", { result: "ok" });
    ledger.end();

    const summary = ledger.getSummary();
    expect(summary.traceId).toBe("trace-02");
    // start event + 2 recorded + end event
    expect(summary.events.length).toBeGreaterThanOrEqual(4);
    expect(summary.events.some((e) => e.name === "intake" && e.type === "node_start")).toBe(true);
  });

  it("accumulates token usage", () => {
    const ledger = new TraceLedger("trace-tokens");
    ledger.addTokenUsage(100, 50);
    ledger.addTokenUsage(200, 75);

    const summary = ledger.getSummary();
    expect(summary.tokenUsage.input).toBe(300);
    expect(summary.tokenUsage.output).toBe(125);
    expect(summary.tokenUsage.total).toBe(425);
  });

  it("counts llm_call events in llmCallsCount", () => {
    const ledger = new TraceLedger("trace-llm");
    ledger.recordEvent("llm_call", "scope_analysis", "info", {});
    ledger.recordEvent("llm_call", "patch_plan", "info", {});
    ledger.recordEvent("node_start", "intake", "info", {});

    const summary = ledger.getSummary();
    expect(summary.llmCallsCount).toBe(2);
  });

  it("computes duration after start/end", () => {
    const ledger = new TraceLedger("trace-duration");
    ledger.start();
    ledger.end();

    const summary = ledger.getSummary();
    expect(summary.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("formatLog returns a non-empty string", () => {
    const ledger = new TraceLedger("trace-log");
    ledger.start();
    ledger.recordEvent("node_start", "repo_scan", "info", {});
    ledger.end();

    const log = ledger.formatLog();
    expect(log).toContain("trace-log");
    expect(log).toContain("repo_scan");
  });

  it("addStep records a step in the summary", () => {
    const ledger = new TraceLedger("trace-steps");
    const step = {
      id: "step-1",
      nodeName: "intake",
      action: "completed",
      input: {},
      output: {},
      durationMs: 10,
      timestamp: new Date().toISOString(),
    };
    ledger.addStep(step);

    const summary = ledger.getSummary();
    expect(summary.stepCount).toBe(1);
    expect(summary.steps[0]?.nodeName).toBe("intake");
  });
});
