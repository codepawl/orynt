import type { ApprovalDecisionInput, CreateRunInput, RunEvent, RunId } from "@codepawl/ipc-contracts";

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

    const runId = "mock-run-1";
    queueMicrotask(() => {
      emitMockRunEvent({
        type: "run.created",
        runId,
        task: input.task,
        summary: "Mock run created",
      });
      emitMockRunEvent({
        type: "run.step_added",
        runId,
        stepIndex: 1,
        summary: "Built mock context packet and queued browser observation",
      });
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
        type: "approval.resolved",
        runId: input.runId,
        approvalId: input.approvalId,
        decision: input.decision,
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
