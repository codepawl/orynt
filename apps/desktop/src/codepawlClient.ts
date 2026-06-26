import { createMockRunSequence } from "@codepawl/shared";
import type { ApprovalDecisionInput, CreateRunInput, RunEvent, RunId } from "@codepawl/shared";

type UnlistenFn = () => void;

type TauriCoreApi = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
};

type TauriEventApi = {
  listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn>;
};

let mockListeners = new Set<(event: RunEvent) => void>();

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function loadTauriApi(): Promise<{ core: TauriCoreApi; event: TauriEventApi } | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  try {
    const [core, event] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/api/event")]);
    return {
      core,
      event,
    };
  } catch {
    return null;
  }
}

function emitMockRunEvent(event: RunEvent) {
  for (const listener of mockListeners) {
    listener(event);
  }
}

export const codepawl = {
  async createRun(input: CreateRunInput): Promise<RunId> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<RunId>("run_create", { input });
    }

    const mockRun = createMockRunSequence();
    const runId = mockRun.run.id;
    queueMicrotask(() => {
      for (const event of mockRun.events) {
        emitMockRunEvent(event);
      }
    });

    return { id: runId };
  },

  async cancelRun(runId: string): Promise<void> {
    const tauri = await loadTauriApi();
    if (tauri) {
      await tauri.core.invoke<void>("run_cancel", { runId });
    }
  },

  async approve(input: ApprovalDecisionInput): Promise<void> {
    const tauri = await loadTauriApi();
    if (tauri) {
      await tauri.core.invoke<void>("approval_respond", { input });
      return;
    }

    queueMicrotask(() => {
      emitMockRunEvent({
        id: `${input.runId}-event-approval-${input.approvalId}`,
        runId: input.runId,
        sequence: 10_000,
        type: "action_blocked_or_approved",
        timestamp: new Date().toISOString(),
        actor: { kind: "policy", id: "mock-policy", displayName: "Mock Policy" },
        payload: {
          summary: `Approval ${input.decision} for ${input.approvalId}`,
          approvalId: input.approvalId,
          decision: input.decision,
        },
        redaction: { applied: false, redactedPaths: [] },
        artifacts: [],
        safety: {
          policyMode: "safe",
          riskLevel: input.decision === "approved" ? "low" : "blocked",
          approvalRequired: false,
          protectedPathTouched: false,
          commandAllowed: input.decision === "approved",
          reasons: [`operator ${input.decision}`],
        },
      });
    });
  },

  async onRunEvent(handler: (event: RunEvent) => void): Promise<UnlistenFn> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.event.listen<RunEvent>("run_event", (event) => handler(event.payload));
    }

    mockListeners.add(handler);
    return () => {
      mockListeners.delete(handler);
    };
  },

  resetMockListenersForTest() {
    mockListeners = new Set();
  },
};
