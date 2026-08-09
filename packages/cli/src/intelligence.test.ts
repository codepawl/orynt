import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "bun:test";
import { LocalIntelligenceRuntime } from "@codepawl/intelligence-runtime";
import { contextVmSessionId } from "@codepawl/shared";

import { runIntelligenceCli } from "./intelligence";

describe("intelligence CLI", () => {
  it("initializes, reports, and verifies canonical ContextVM state", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-intel-"));
    const lines: string[] = [];
    await expect(
      runIntelligenceCli({
        argv: ["init", "--json"],
        stateRoot,
        write: (line) => lines.push(line),
      }),
    ).resolves.toBe(0);
    expect(JSON.parse(lines.pop()!)).toMatchObject({
      health: "empty",
      journalMode: "wal",
      foreignKeys: true,
    });
    await expect(
      runIntelligenceCli({
        argv: ["status", "--json"],
        stateRoot,
        write: (line) => lines.push(line),
      }),
    ).resolves.toBe(0);
    expect(JSON.parse(lines.join("\n"))).toMatchObject({
      schemaVersion: 2,
      layoutVersion: 2,
      health: "empty",
      memory: { schemaVersion: 3 },
      improvements: { schemaVersion: 2 },
      contextVm: {
        databaseSchemaVersion: 10,
        checkpointCount: 0,
        consolidationCount: 0,
        derivedMemoryAuthority: "contextvm_sqlite_v2",
        migrationState: "completed",
        cache: {
          maxBytes: 64 * 1024 * 1024,
          bytes: 0,
          entries: 0,
        },
      },
    });
    lines.splice(0);
    await expect(
      runIntelligenceCli({
        argv: ["verify", "--json"],
        stateRoot,
        write: (line) => lines.push(line),
      }),
    ).resolves.toBe(0);
    expect(JSON.parse(lines.join("\n"))).toMatchObject({ status: "pass" });
    lines.splice(0);
    await expect(
      runIntelligenceCli({
        argv: ["rebuild-index", "--json"],
        stateRoot,
        write: (line) => lines.push(line),
      }),
    ).resolves.toBe(0);
    expect(JSON.parse(lines.join("\n"))).toMatchObject({
      indexVersion: 1,
      indexedMemoryPages: 0,
    });
    lines.splice(0);
    await expect(
      runIntelligenceCli({
        argv: ["search", "composer.ts", "--namespace", "test|workspace||", "--json"],
        stateRoot,
        write: (line) => lines.push(line),
      }),
    ).resolves.toBe(0);
    expect(JSON.parse(lines.join("\n"))).toMatchObject({
      query: "composer.ts",
      candidates: [],
    });
    lines.splice(0);
    await expect(
      runIntelligenceCli({
        argv: [
          "explain-context",
          "fix",
          "--namespace",
          "test|workspace||",
          "--goal",
          "Fix ContextVM",
          "--constraint",
          "Preserve authority",
          "--budget",
          "512",
          "--json",
        ],
        stateRoot,
        write: (line) => lines.push(line),
      }),
    ).resolves.toBe(0);
    expect(JSON.parse(lines.join("\n"))).toMatchObject({
      status: "ready",
      hardBudgetTokens: 512,
      items: expect.arrayContaining([
        expect.objectContaining({ loadReason: "mandatory_current_goal" }),
        expect.objectContaining({ loadReason: "mandatory_required_constraint" }),
      ]),
    });
  });

  it("creates, recovers, and consolidates ContextVM sessions explicitly", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-intel-"));
    const runtime = new LocalIntelligenceRuntime(stateRoot);
    const sessionId = contextVmSessionId("cli-recovery-session");
    await runtime.contextVm.appendEvent({
      sessionId,
      source: { kind: "test_fixture", id: "cli-recovery-goal" },
      occurredAt: "2026-08-05T00:00:00.000Z",
      actor: { kind: "user", id: "operator" },
      kind: "user_message",
      payload: { eventType: "goal_received", summary: "Recover CLI state" },
      sensitivity: "internal",
    });
    runtime.contextVm.close();
    const lines: string[] = [];
    expect(await runIntelligenceCli({
      argv: ["checkpoint", sessionId, "--json"],
      stateRoot,
      write: (line) => lines.push(line),
    })).toBe(0);
    expect(JSON.parse(lines.pop()!)).toMatchObject({
      sessionId,
      capturedThroughSequence: 1,
    });
    await expect(runIntelligenceCli({
      argv: ["recover", sessionId, "--json"],
      stateRoot,
      write: (line) => lines.push(line),
    })).resolves.toBe(0);
    expect(JSON.parse(lines.pop()!)).toMatchObject({
      status: "recovered",
      source: "checkpoint",
    });
    await expect(runIntelligenceCli({
      argv: [
        "consolidate",
        sessionId,
        "--namespace",
        "test|workspace||",
        "--json",
      ],
      stateRoot,
      write: (line) => lines.push(line),
    })).resolves.toBe(0);
    expect(JSON.parse(lines.pop()!)).toMatchObject({
      sessionId,
      outputMemoryIds: [expect.stringMatching(/^mem_/)],
    });
  });
});
