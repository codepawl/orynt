import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import {
  renderSessionEntry,
  runSessionCli,
  sessionComposerChoice,
} from "./sessions";
import {
  FileCliSessionStore,
  createSessionSnapshot,
  type CliSessionCatalogEntry,
} from "./state";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    ),
  );
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-sessions-cli-"));
  roots.push(root);
  const output: string[] = [];
  return {
    root,
    store: new FileCliSessionStore(root),
    output,
    dependencies: {
      stateRoot: root,
      cwd: "/work/alpha",
      write: (value: string) => output.push(value),
    },
  };
}

function snapshot(
  sessionId: string,
  repositoryPath: string,
  now = "2026-08-04T00:00:00.000Z",
) {
  return createSessionSnapshot({
    sessionId,
    repositoryPath,
    modelId: "gpt-5.5",
    thinkingEffort: "high",
    now,
  });
}

describe("sessions CLI", () => {
  it("renders responsive two-line entries and rich picker metadata", () => {
    const entry: CliSessionCatalogEntry = {
      sessionId: "session-responsive-123456",
      title: "A long saved session title that remains readable",
      repositoryPath: "/work/alpha",
      pinned: false,
      turnCount: 12,
      snapshotBytes: 512,
      verification: "passed",
      modifiedWorktreeProtected: false,
      createdAt: "2026-08-04T00:00:00.000Z",
      updatedAt: "2026-08-04T12:34:56.000Z",
    };

    for (const width of [120, 60, 30, 20]) {
      const rendered = renderSessionEntry(entry, {
        width,
        currentSessionId: entry.sessionId,
        index: 0,
      });
      expect(rendered.split("\n")).toHaveLength(2);
      for (const line of rendered.split("\n")) {
        expect(line.length).toBeLessThanOrEqual(width);
      }
      expect(rendered).toContain("current");
    }
    expect(renderSessionEntry(entry, { width: 120 })).toContain(
      "2026-08-04 12:34 UTC",
    );
    expect(sessionComposerChoice(entry, entry.sessionId)).toEqual(
      expect.objectContaining({
        value: entry.sessionId,
        description: expect.stringContaining("current · 12 turns"),
        details: expect.arrayContaining([
          `Session · ${entry.sessionId}`,
          "Repository · /work/alpha",
          "Verification · passed",
        ]),
      }),
    );
  });

  it("filters by repository and includes Trash only when requested", async () => {
    const context = await fixture();
    await context.store.save(snapshot("alpha-active", "/work/alpha"));
    await context.store.save(snapshot("beta-active", "/work/beta"));
    await context.store.save(snapshot("alpha-trash", "/work/alpha"));
    await context.store.trash("alpha-trash");

    expect(await runSessionCli(["list"], context.dependencies)).toBe(0);
    expect(context.output.at(-1)).toContain("alpha-active");
    expect(context.output.at(-1)).not.toContain("beta-active");
    expect(context.output.at(-1)).not.toContain("alpha-trash");

    expect(
      await runSessionCli(["list", "--trash"], context.dependencies),
    ).toBe(0);
    expect(context.output.at(-1)).toContain("alpha-active");
    expect(context.output.at(-1)).toContain("alpha-trash");

    expect(
      await runSessionCli(["list", "--all", "--json"], context.dependencies),
    ).toBe(0);
    const page = JSON.parse(context.output.at(-1) ?? "{}") as {
      entries?: Array<{ sessionId: string }>;
    };
    expect(page.entries?.map(({ sessionId }) => sessionId).sort()).toEqual([
      "alpha-active",
      "alpha-trash",
      "beta-active",
    ]);
  });

  it("shows bounded safe details and returns code 2 for a missing session", async () => {
    const context = await fixture();
    const session = snapshot("session-show", "/work/alpha");
    session.title = "\u001b[31mUnsafe title";
    session.turnCount = 3;
    await context.store.save(session);

    expect(
      await runSessionCli(["show", "session-show"], context.dependencies),
    ).toBe(0);
    expect(context.output.at(-1)).toContain("session-show");
    expect(context.output.at(-1)).toContain("Turns       3");
    expect(context.output.at(-1)).not.toContain("\u001b");

    expect(
      await runSessionCli(["show", "missing"], context.dependencies),
    ).toBe(2);
    expect(context.output.at(-1)).toBe("Session not found: missing");
  });

  it("pins, protects, trashes, and restores a session", async () => {
    const context = await fixture();
    await context.store.save(snapshot("session-lifecycle", "/work/alpha"));

    expect(
      await runSessionCli(
        ["pin", "session-lifecycle"],
        context.dependencies,
      ),
    ).toBe(0);
    await expect(
      runSessionCli(
        ["trash", "session-lifecycle"],
        context.dependencies,
      ),
    ).rejects.toThrow("Pinned sessions cannot be trashed");

    await runSessionCli(
      ["unpin", "session-lifecycle"],
      context.dependencies,
    );
    await runSessionCli(
      ["trash", "session-lifecycle"],
      context.dependencies,
    );
    await expect(
      context.store.load("session-lifecycle"),
    ).resolves.toMatchObject({ trashedAt: expect.any(String) });

    await runSessionCli(
      ["restore", "session-lifecycle"],
      context.dependencies,
    );
    expect(
      (await context.store.load("session-lifecycle"))?.trashedAt,
    ).toBeUndefined();
  });

  it("keeps cleanup as a dry run until --apply is explicit", async () => {
    const context = await fixture();
    await context.store.save(
      snapshot(
        "session-expired",
        "/work/alpha",
        "2026-01-01T00:00:00.000Z",
      ),
    );
    const oldTrash = snapshot(
      "session-old-trash",
      "/work/alpha",
      "2026-01-01T00:00:00.000Z",
    );
    oldTrash.trashedAt = "2026-01-02T00:00:00.000Z";
    await context.store.save(oldTrash);

    await runSessionCli(["cleanup"], context.dependencies);
    expect(context.output.at(-1)).toContain("Session cleanup dry run");
    await expect(
      context.store.load("session-expired"),
    ).resolves.toBeDefined();
    await expect(
      context.store.load("session-old-trash"),
    ).resolves.toBeDefined();

    await runSessionCli(["cleanup", "--apply"], context.dependencies);
    expect(context.output.at(-1)).toContain("Session cleanup applied");
    await expect(
      context.store.load("session-expired"),
    ).resolves.toMatchObject({ trashedAt: expect.any(String) });
    await expect(
      context.store.load("session-old-trash"),
    ).resolves.toBeUndefined();
  });

  it("fails with exact usage for missing identifiers and unknown commands", async () => {
    const context = await fixture();

    await expect(
      runSessionCli(["show"], context.dependencies),
    ).rejects.toThrow("Usage: orynt sessions show <id> [--json]");
    await expect(
      runSessionCli(["unknown"], context.dependencies),
    ).rejects.toThrow(
      "Usage: orynt sessions <list|show|pin|unpin|trash|restore|cleanup>",
    );
  });
});
