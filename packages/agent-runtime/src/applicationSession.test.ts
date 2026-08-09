import { describe, expect, it, vi } from "bun:test";

import { createAgentApplicationSession } from "./applicationSession";

describe("agent application session", () => {
  it("binds pending decisions to an exact revision, id, and digest", async () => {
    const dispatch = vi
      .fn()
      .mockResolvedValueOnce({
        status: "input_required",
        summary: "Repository approval is required.",
        pendingDecision: {
          id: "approval-1",
          kind: "repository_approval",
          prompt: "Approve this repository action?",
          summary: "Write README.md",
          digest: "digest-1",
          options: [
            { id: "approved", label: "Approve once" },
            { id: "rejected", label: "Reject" },
          ],
        },
      })
      .mockResolvedValueOnce({
        status: "completed",
        summary: "Repository action completed.",
        events: [
          {
            type: "approval_recorded",
            summary: "Repository approval recorded.",
          },
        ],
        value: { status: "pass" },
      });
    const session = createAgentApplicationSession({
      sessionId: "session-1",
      driver: { dispatch },
      now: () => "2026-08-03T00:00:00.000Z",
      id: () => "fixed",
    });

    const pending = await session.dispatch({
      schemaVersion: 1,
      type: "submit_message",
      sessionId: "session-1",
      expectedRevision: 0,
      message: "Update README.md",
      acceptanceCriteria: [],
      selectedSkillIds: [],
    });
    expect(pending.snapshot).toMatchObject({
      revision: 1,
      status: "input_required",
      pendingDecision: {
        id: "approval-1",
        digest: "digest-1",
        requestedRevision: 1,
      },
    });

    await expect(
      session.dispatch({
        schemaVersion: 1,
        type: "decide_approval",
        sessionId: "session-1",
        expectedRevision: 1,
        decisionId: "approval-1",
        decisionDigest: "stale-digest",
        decision: "approved",
      }),
    ).rejects.toThrow("approval digest is stale");
    expect(dispatch).toHaveBeenCalledOnce();

    const completed = await session.dispatch({
      schemaVersion: 1,
      type: "decide_approval",
      sessionId: "session-1",
      expectedRevision: 1,
      decisionId: "approval-1",
      decisionDigest: "digest-1",
      decision: "approved",
    });
    expect(completed.snapshot.status).toBe("completed");
    expect(completed.value).toEqual({ status: "pass" });
  });

  it("rejects concurrent commands and publishes sequenced events", async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const session = createAgentApplicationSession({
      sessionId: "session-2",
      driver: {
        dispatch: async () => {
          await blocked;
          return {
            status: "completed",
            summary: "Done.",
            events: [
              { type: "message_completed", summary: "Answer complete." },
            ],
          };
        },
      },
      now: () => "2026-08-03T00:00:00.000Z",
    });
    const events: string[] = [];
    session.subscribe((event) => events.push(`${event.sequence}:${event.type}`));
    const first = session.dispatch({
      schemaVersion: 1,
      type: "submit_message",
      sessionId: "session-2",
      expectedRevision: 0,
      message: "Explain the repository.",
      acceptanceCriteria: [],
      selectedSkillIds: [],
    });

    await expect(
      session.dispatch({
        schemaVersion: 1,
        type: "submit_message",
        sessionId: "session-2",
        expectedRevision: 0,
        message: "Second message",
        acceptanceCriteria: [],
        selectedSkillIds: [],
      }),
    ).rejects.toThrow("already has an active command");
    release?.();
    await first;
    expect(events).toEqual([
      "1:message_completed",
      "2:turn_completed",
    ]);
  });

  it("records a failed revision without allowing stale replay", async () => {
    const session = createAgentApplicationSession({
      sessionId: "session-3",
      driver: {
        dispatch: async () => {
          throw new Error("provider unavailable");
        },
      },
    });
    const command = {
      schemaVersion: 1 as const,
      type: "submit_message" as const,
      sessionId: "session-3",
      expectedRevision: 0,
      message: "Inspect the repository.",
      acceptanceCriteria: [],
      selectedSkillIds: [],
    };
    await expect(session.dispatch(command)).rejects.toThrow(
      "provider unavailable",
    );
    expect(session.snapshot()).toMatchObject({
      revision: 1,
      status: "failed",
      summary: "provider unavailable",
    });
    await expect(session.dispatch(command)).rejects.toThrow(
      "revision conflict",
    );
  });

  it("bounds retained history without reusing event sequence numbers", async () => {
    const session = createAgentApplicationSession({
      sessionId: "session-bounded",
      driver: {
        dispatch: async () => ({
          status: "completed",
          summary: "Done.",
          events: [{ type: "message_completed", summary: "Answer complete." }],
        }),
      },
      id: () => "bounded",
    });

    for (let revision = 0; revision < 40; revision += 1) {
      await session.dispatch({
        schemaVersion: 1,
        type: "submit_message",
        sessionId: "session-bounded",
        expectedRevision: revision,
        message: `message-${revision}`,
        acceptanceCriteria: [],
        selectedSkillIds: [],
      });
    }

    const snapshot = session.snapshot();
    expect(snapshot.events).toHaveLength(64);
    expect(snapshot.events[0]?.sequence).toBe(17);
    expect(snapshot.events.at(-1)?.sequence).toBe(80);
  });
});
