import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import { WorkspaceRevisionAuthority } from "./authority.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("WorkspaceRevisionAuthority", () => {
  it("uses one monotonic revision domain and suppresses duplicate mutation events", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-authority-"));
    roots.push(root);
    await writeFile(path.join(root, "main.ts"), "export const value = 1;\n");
    const authority = await WorkspaceRevisionAuthority.open(root);
    try {
      const initial = await authority.observeFile("main.ts");
      const changed = "export const value = 2;\n";
      await writeFile(path.join(root, "main.ts"), changed);
      const revision = await authority.publishMutation([
        { path: "main.ts", content: changed },
      ]);
      expect(revision).toBeGreaterThan(initial.revision);
      expect(await authority.publishMutation([
        { path: "main.ts", content: changed },
      ])).toBe(revision);
      expect(authority.snapshot().revision).toBe(revision);
    } finally {
      await authority.close();
    }
  });
});
