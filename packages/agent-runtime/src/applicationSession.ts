import { randomUUID } from "node:crypto";

import type {
  AgentSessionCommandV1,
  AgentSessionEventTypeV1,
  AgentSessionEventV1,
  AgentSessionPendingDecisionV1,
  AgentSessionSnapshotV1,
  AgentSessionStatusV1,
} from "@codepawl/shared";

const MAX_RETAINED_SESSION_EVENTS = 64;
const MAX_RETAINED_ARTIFACT_REFS = 128;

export type AgentApplicationEventInputV1 = {
  type: AgentSessionEventTypeV1;
  summary: string;
  payload?: Record<string, unknown>;
  artifactRefs?: string[];
};

export type AgentApplicationDriverResult<TResult> = {
  status: Exclude<AgentSessionStatusV1, "idle" | "thinking">;
  summary: string;
  pendingDecision?: Omit<
    AgentSessionPendingDecisionV1,
    "schemaVersion" | "requestedRevision"
  >;
  events?: AgentApplicationEventInputV1[];
  artifactRefs?: string[];
  value?: TResult;
};

export type AgentApplicationDriver<TResult> = {
  dispatch(input: {
    command: AgentSessionCommandV1;
    snapshot: AgentSessionSnapshotV1;
    signal: AbortSignal;
  }): Promise<AgentApplicationDriverResult<TResult>>;
  close?: () => Promise<void>;
};

export type AgentApplicationDispatchResult<TResult> = {
  snapshot: AgentSessionSnapshotV1;
  value?: TResult;
};

export interface AgentApplicationSession<TResult> {
  dispatch(
    command: AgentSessionCommandV1,
  ): Promise<AgentApplicationDispatchResult<TResult>>;
  snapshot(): AgentSessionSnapshotV1;
  subscribe(listener: (event: AgentSessionEventV1) => void): () => void;
  cancelActive(): void;
  close(): Promise<void>;
}

export type AgentApplicationSessionOptions<TResult> = {
  sessionId: string;
  driver: AgentApplicationDriver<TResult>;
  initialSnapshot?: AgentSessionSnapshotV1;
  now?: () => string;
  id?: () => string;
};

function terminalEventType(
  status: AgentApplicationDriverResult<unknown>["status"],
): AgentSessionEventTypeV1 | undefined {
  if (status === "completed") return "turn_completed";
  if (status === "failed") return "turn_failed";
  if (status === "cancelled") return "turn_cancelled";
  if (status === "execution_in_doubt") return "execution_in_doubt";
  return undefined;
}

function expectedDecisionKind(
  command: AgentSessionCommandV1,
): AgentSessionPendingDecisionV1["kind"] | undefined {
  if (command.type === "answer_clarification") return "clarification";
  if (command.type === "confirm_assumptions") {
    return "assumption_confirmation";
  }
  return undefined;
}

function assertCommandAllowed(
  command: AgentSessionCommandV1,
  snapshot: AgentSessionSnapshotV1,
): void {
  if (command.sessionId !== snapshot.sessionId) {
    throw new Error("Agent session command targets a different session.");
  }
  if (command.expectedRevision !== snapshot.revision) {
    throw new Error(
      `Agent session revision conflict: expected ${command.expectedRevision}, current ${snapshot.revision}.`,
    );
  }
  if (
    command.type === "submit_message" &&
    (
      snapshot.status === "thinking" ||
      snapshot.status === "running" ||
      snapshot.status === "input_required" ||
      snapshot.status === "execution_in_doubt"
    )
  ) {
    throw new Error(
      `Agent session cannot accept a new message while ${snapshot.status}.`,
    );
  }
  if (
    command.type === "answer_clarification" ||
    command.type === "confirm_assumptions" ||
    command.type === "decide_approval"
  ) {
    const pending = snapshot.pendingDecision;
    if (!pending || snapshot.status !== "input_required") {
      throw new Error("Agent session has no pending operator decision.");
    }
    if (command.decisionId !== pending.id) {
      throw new Error("Agent session decision id is stale or mismatched.");
    }
    const expectedKind = expectedDecisionKind(command);
    if (expectedKind && pending.kind !== expectedKind) {
      throw new Error(
        `Agent session expected ${pending.kind}, not ${expectedKind}.`,
      );
    }
    if (
      command.type === "decide_approval" &&
      (
        ![
          "repository_approval",
          "browser_approval",
          "browser_vision_trust",
        ].includes(pending.kind) ||
        command.decisionDigest !== pending.digest
      )
    ) {
      throw new Error("Agent session approval digest is stale or mismatched.");
    }
  }
}

function validateDriverResult<TResult>(
  result: AgentApplicationDriverResult<TResult>,
): void {
  if (!result.summary.trim()) {
    throw new Error("Agent application driver returned an empty summary.");
  }
  if (result.status === "input_required" && !result.pendingDecision) {
    throw new Error(
      "Agent application driver requires input without a pending decision.",
    );
  }
  if (result.status !== "input_required" && result.pendingDecision) {
    throw new Error(
      "Agent application driver returned a decision outside input-required state.",
    );
  }
}

export function createAgentApplicationSession<TResult>(
  options: AgentApplicationSessionOptions<TResult>,
): AgentApplicationSession<TResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const id = options.id ?? randomUUID;
  let snapshot: AgentSessionSnapshotV1 = options.initialSnapshot
    ? structuredClone(options.initialSnapshot)
    : {
        schemaVersion: 1,
        sessionId: options.sessionId,
        revision: 0,
        status: "idle",
        summary: "Agent session is ready.",
        pendingDecision: null,
        events: [],
        artifactRefs: [],
        updatedAt: now(),
      };
  if (snapshot.sessionId !== options.sessionId) {
    throw new Error("Initial agent snapshot targets a different session.");
  }
  const listeners = new Set<(event: AgentSessionEventV1) => void>();
  let activeController: AbortController | undefined;
  let closed = false;
  let nextEventSequence =
    snapshot.events.reduce(
      (maximum, event) => Math.max(maximum, event.sequence),
      0,
    ) + 1;

  const appendEvents = (
    revision: number,
    inputs: AgentApplicationEventInputV1[],
  ): AgentSessionEventV1[] => {
    const events: AgentSessionEventV1[] = inputs.map((input, index) => ({
      schemaVersion: 1 as const,
      id: `agent-event-${id()}`,
      sessionId: snapshot.sessionId,
      sequence: nextEventSequence + index,
      revision,
      type: input.type,
      summary: input.summary,
      ...(input.payload ? { payload: structuredClone(input.payload) } : {}),
      artifactRefs: [...(input.artifactRefs ?? [])],
      recordedAt: now(),
    }));
    nextEventSequence += events.length;
    return events;
  };

  const publish = (events: AgentSessionEventV1[]): void => {
    for (const event of events) {
      for (const listener of listeners) listener(structuredClone(event));
    }
  };

  return {
    dispatch: async (command) => {
      if (closed) throw new Error("Agent application session is closed.");
      if (activeController) {
        throw new Error("Agent application session already has an active command.");
      }
      assertCommandAllowed(command, snapshot);
      const controller = new AbortController();
      activeController = controller;
      const before = structuredClone(snapshot);
      try {
        const result = await options.driver.dispatch({
          command: structuredClone(command),
          snapshot: before,
          signal: controller.signal,
        });
        validateDriverResult(result);
        const revision = before.revision + 1;
        const automaticType =
          result.status === "input_required"
            ? "input_required"
            : terminalEventType(result.status);
        const eventInputs = [...(result.events ?? [])];
        if (
          automaticType &&
          !eventInputs.some(({ type }) => type === automaticType)
        ) {
          eventInputs.push({
            type: automaticType,
            summary: result.summary,
            artifactRefs: result.artifactRefs,
          });
        }
        const events = appendEvents(revision, eventInputs);
        snapshot = {
          schemaVersion: 1,
          sessionId: before.sessionId,
          revision,
          status: result.status,
          summary: result.summary,
          pendingDecision: result.pendingDecision
            ? {
                schemaVersion: 1,
                ...structuredClone(result.pendingDecision),
                requestedRevision: revision,
              }
            : null,
          events: [...before.events, ...events].slice(
            -MAX_RETAINED_SESSION_EVENTS,
          ),
          artifactRefs: [
            ...new Set([
              ...before.artifactRefs,
              ...(result.artifactRefs ?? []),
              ...events.flatMap(({ artifactRefs }) => artifactRefs),
            ]),
          ].slice(-MAX_RETAINED_ARTIFACT_REFS),
          updatedAt: now(),
        };
        publish(events);
        return {
          snapshot: structuredClone(snapshot),
          ...(result.value === undefined
            ? {}
            : { value: structuredClone(result.value) }),
        };
      } catch (error) {
        const revision = before.revision + 1;
        const summary =
          error instanceof Error ? error.message : "Agent session command failed.";
        const events = appendEvents(revision, [
          { type: "turn_failed", summary },
        ]);
        snapshot = {
          ...before,
          revision,
          status: controller.signal.aborted ? "cancelled" : "failed",
          summary,
          pendingDecision: null,
          events: [...before.events, ...events].slice(
            -MAX_RETAINED_SESSION_EVENTS,
          ),
          updatedAt: now(),
        };
        publish(events);
        throw error;
      } finally {
        if (activeController === controller) activeController = undefined;
      }
    },
    snapshot: () => structuredClone(snapshot),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    cancelActive: () => activeController?.abort(),
    close: async () => {
      if (closed) return;
      closed = true;
      activeController?.abort();
      listeners.clear();
      await options.driver.close?.();
    },
  };
}
