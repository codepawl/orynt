import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  atomicWriteFileDurable,
  compareAndSwapVersionedJson,
  loadVersionedJson,
  LocalStateError,
  withExclusiveFileLock,
} from "./index";

type TestState = {
  schemaVersion: 1;
  revision: number;
  values: number[];
};

let root = "";
const valid = (value: unknown): value is TestState =>
  Boolean(
    value &&
      typeof value === "object" &&
      (value as Partial<TestState>).schemaVersion === 1 &&
      Number.isSafeInteger((value as Partial<TestState>).revision) &&
      Array.isArray((value as Partial<TestState>).values) &&
      (value as Partial<TestState>).values?.every(Number.isSafeInteger),
  );
const initialize = (): TestState => ({ schemaVersion: 1, revision: 0, values: [] });

describe("local-state", () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "orynt-local-state-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("durably replaces a file without leaving temporary state", async () => {
    const filePath = path.join(root, "state.json");
    await atomicWriteFileDurable(filePath, "first\n");
    await atomicWriteFileDurable(filePath, "second\n");
    expect(await readFile(filePath, "utf8")).toBe("second\n");
  });

  it("strictly validates versioned JSON and supports explicit migration", async () => {
    const filePath = path.join(root, "state.json");
    await writeFile(filePath, JSON.stringify({ values: [1] }));
    await expect(
      loadVersionedJson({ filePath, schemaVersion: 1, validate: valid, initialize }),
    ).rejects.toMatchObject({ code: "invalid_schema" });
    await expect(
      loadVersionedJson({
        filePath,
        schemaVersion: 1,
        validate: valid,
        initialize,
        migrate: (value) => ({
          schemaVersion: 1,
          revision: 0,
          values: (value as { values: number[] }).values,
        }),
      }),
    ).resolves.toEqual({ schemaVersion: 1, revision: 0, values: [1] });
  });

  it("serializes mutations and rejects stale expected revisions", async () => {
    const filePath = path.join(root, "state.json");
    await Promise.all(
      Array.from({ length: 10 }, (_, value) =>
        compareAndSwapVersionedJson({
          filePath,
          schemaVersion: 1,
          validate: valid,
          initialize,
          mutate: (state) => state.values.push(value),
        }),
      ),
    );
    const state = await loadVersionedJson({
      filePath,
      schemaVersion: 1,
      validate: valid,
      initialize,
    });
    expect(state.revision).toBe(10);
    expect(state.values).toHaveLength(10);

    await expect(
      compareAndSwapVersionedJson({
        filePath,
        schemaVersion: 1,
        validate: valid,
        initialize,
        expectedRevision: 9,
        mutate: () => undefined,
      }),
    ).rejects.toMatchObject({ code: "revision_conflict" });
  });

  it("creates missing parent directories before acquiring a lock", async () => {
    const filePath = path.join(root, "nested", "state.json");
    await withExclusiveFileLock(filePath, async () => {
      await atomicWriteFileDurable(filePath, "nested\n");
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe("nested\n");
  });

  it("times out for a live owner and recovers only an absent-owner lock", async () => {
    const filePath = path.join(root, "state.json");
    await writeFile(
      `${filePath}.lock`,
      JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString(), token: "live" }),
    );
    await expect(
      withExclusiveFileLock(filePath, async () => undefined, {
        timeoutMs: 20,
        retryDelayMs: 2,
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<LocalStateError>>({ code: "lock_timeout" }));

    await writeFile(
      `${filePath}.lock`,
      JSON.stringify({ pid: 2_147_483_647, acquiredAt: new Date().toISOString(), token: "dead" }),
    );
    await expect(
      withExclusiveFileLock(filePath, async () => "recovered", {
        timeoutMs: 100,
        retryDelayMs: 2,
      }),
    ).resolves.toBe("recovered");
  });

  it("serializes competing stale-lock recovery without deleting a replacement live lock", async () => {
    const filePath = path.join(root, "state.json");
    await writeFile(
      `${filePath}.lock`,
      JSON.stringify({ pid: 2_147_483_647, acquiredAt: new Date().toISOString(), token: "dead" }),
    );
    let active = 0;
    let maximumActive = 0;
    const entrants: number[] = [];
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        withExclusiveFileLock(filePath, async () => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          entrants.push(index);
          await new Promise((resolve) => setTimeout(resolve, 3));
          active -= 1;
        }, { timeoutMs: 1_000, retryDelayMs: 1 }),
      ),
    );
    expect(maximumActive).toBe(1);
    expect(entrants).toHaveLength(8);
  });
});
