import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import {
  LspAdapterRegistry,
  validateCustomAdapterExecutable,
  type CustomLanguageServerAdapter,
} from "./adapters.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("LSP adapter registry", () => {
  it("detects bundled languages without spawning them", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-adapters-"));
    roots.push(root);
    await writeFile(path.join(root, "tsconfig.json"), "{}\n");
    await writeFile(path.join(root, "main.ts"), "export const value = 1;\n");
    const registry = new LspAdapterRegistry();
    const detected = await registry.detect(root);
    expect(registry.list().map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "typescript",
        "python",
        "rust",
        "go",
        "clangd",
        "java",
        "csharp",
        "lua",
        "bash",
        "json",
        "yaml",
        "html",
        "css",
      ]),
    );
    expect(detected).toContainEqual(
      expect.objectContaining({
        adapterId: "typescript",
        availability: "bundled",
      }),
    );
  });

  it("accepts only an explicit executable custom adapter", async () => {
    const custom: CustomLanguageServerAdapter = {
      schemaVersion: 1,
      id: "fixture-lsp",
      languages: ["fixture"],
      extensions: [".fixture"],
      rootMarkers: ["fixture.json"],
      command: process.execPath,
      args: ["fixture-server.js", "--stdio"],
    };
    expect(await validateCustomAdapterExecutable(custom)).toBe(
      process.execPath,
    );
    expect(() =>
      new LspAdapterRegistry([{ ...custom, command: "node" }])
    ).toThrow(/absolute path/u);
  });
});
