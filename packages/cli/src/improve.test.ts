import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import { runImproveCli } from "./improve";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("improvement CLI", () => {
  it("reports an empty active registry without exposing artifact payloads", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-improve-"));
    roots.push(root);
    const output: string[] = [];
    const code = await runImproveCli(["status"], {
      stateRoot: root,
      write: (line) => output.push(line),
    });
    expect(code).toBe(0);
    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({
      mode: "shadow_review",
      candidateCount: 0,
      active: [],
    });
  });

  it("lists an empty shadow ledger without creating authority", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-improve-"));
    roots.push(root);
    const output: string[] = [];
    const code = await runImproveCli(["list"], {
      stateRoot: root,
      write: (line) => output.push(line),
    });
    expect(code).toBe(0);
    expect(output).toEqual(["No improvement candidates."]);
  });

  it("requires interactive confirmation for promotion decisions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-improve-"));
    roots.push(root);
    const output: string[] = [];
    const code = await runImproveCli(["approve", "missing"], {
      stateRoot: root,
      write: (line) => output.push(line),
    });
    expect(code).toBe(1);
    expect(output[0]).toMatch(/not found/);
  });
});
