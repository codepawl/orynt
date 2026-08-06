import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "bun:test";
import type {
  CodeAction,
  Command,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  WorkspaceEdit,
} from "vscode-languageserver-protocol";

import { LspManager } from "./manager.js";
import { LspWorkspace } from "./workspace.js";

const roots: string[] = [];

async function fixture(): Promise<{ root: string; source: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-lsp-runtime-"));
  roots.push(root);
  const source = path.join(root, "index.ts");
  await writeFile(
    path.join(root, "tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        strict: true,
        target: "ES2022",
        module: "ESNext",
      },
      include: ["index.ts"],
    })}\n`,
  );
  await writeFile(
    source,
    [
      "export function greet(name: string): string {",
      "  return `Hello ${name}`;",
      "}",
      "",
      "export const result = greet('Orynt');",
      "",
    ].join("\n"),
  );
  return { root, source };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("persistent TypeScript LSP session", () => {
  it("reuses one bundled server process for repeated semantic requests", async () => {
    const { root, source } = await fixture();
    const manager = new LspManager();
    try {
      const first = await manager.acquireTypeScript(root);
      const firstSnapshot = first.snapshot();
      const uri = pathToFileURL(source).href;
      await first.notify("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: "typescript",
          version: 1,
          text: await import("node:fs/promises").then(({ readFile }) =>
            readFile(source, "utf8")
          ),
        },
      });
      const symbols = await first.request<DocumentSymbol[]>(
        "textDocument/documentSymbol",
        { textDocument: { uri } },
        15_000,
      );
      const second = await manager.acquireTypeScript(root);
      const repeated = await second.request<DocumentSymbol[]>(
        "textDocument/documentSymbol",
        { textDocument: { uri } },
        15_000,
      );

      expect(symbols.map(({ name }) => name)).toContain("greet");
      expect(repeated.map(({ name }) => name)).toContain("result");
      expect(second).toBe(first);
      expect(second.snapshot().processId).toBe(firstSnapshot.processId);
      expect(second.snapshot()).toMatchObject({
        state: "ready",
        epoch: 1,
        adapterId: "typescript",
      });
      const textDocument = { uri };
      const position = { line: 4, character: 23 };
      expect((await first.request<Hover | null>(
        "textDocument/hover",
        { textDocument, position },
        15_000,
      ))).not.toBeNull();
      expect((await first.request<Location | Location[] | LocationLink[] | null>(
        "textDocument/definition",
        { textDocument, position },
        15_000,
      ))).not.toBeNull();
      expect((await first.request<Location[] | null>(
        "textDocument/references",
        { textDocument, position, context: { includeDeclaration: true } },
        15_000,
      ))?.length).toBeGreaterThan(0);
      expect((await first.request<WorkspaceEdit | null>(
        "textDocument/rename",
        { textDocument, position, newName: "welcome" },
        15_000,
      ))).not.toBeNull();
    } finally {
      await manager.close();
    }
    expect(manager.snapshots()).toEqual([]);
  }, 30_000);

  it("serves JavaScript through the shared Tier A adapter contract", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-javascript-lsp-"));
    roots.push(root);
    const source = path.join(root, "main.js");
    await writeFile(path.join(root, "jsconfig.json"), JSON.stringify({
      compilerOptions: { checkJs: true },
      include: ["main.js"],
    }));
    await writeFile(
      source,
      [
        "/** @param {string} name */",
        "export function greet(name) { return `Hello ${name}`; }",
        "export const result = greet('Orynt');",
        "",
      ].join("\n"),
    );
    const manager = new LspManager();
    const workspace = await LspWorkspace.open(root, manager, "typescript");
    try {
      await workspace.synchronizeDocument(source);
      const textDocument = { uri: pathToFileURL(source).href };
      const position = { line: 2, character: 24 };
      expect((await workspace.request<Hover | null>(
        "textDocument/hover", { textDocument, position }
      )).data).not.toBeNull();
      expect((await workspace.request<Location | Location[] | LocationLink[] | null>(
        "textDocument/definition", { textDocument, position }
      )).data).not.toBeNull();
      expect((await workspace.request<Location[] | null>(
        "textDocument/references",
        { textDocument, position, context: { includeDeclaration: true } },
      )).data?.length).toBeGreaterThan(0);
      expect((await workspace.request<WorkspaceEdit | null>(
        "textDocument/rename", { textDocument, position, newName: "welcome" }
      )).data).not.toBeNull();
    } finally {
      await workspace.close();
    }
  }, 30_000);

  it("increments the epoch and replays synchronized documents on restart", async () => {
    const { root, source } = await fixture();
    const manager = new LspManager();
    const workspace = await LspWorkspace.open(root, manager, "typescript");
    try {
      await workspace.synchronizeDocument(source);
      const before = manager.snapshots()[0]!;
      await manager.restart("typescript");
      const response = await workspace.request<DocumentSymbol[]>(
        "textDocument/documentSymbol",
        { textDocument: { uri: pathToFileURL(source).href } },
      );
      const after = manager.snapshots()[0]!;
      expect(after.epoch).toBe(before.epoch + 1);
      expect(after.processId).not.toBe(before.processId);
      expect(after.crashCount).toBe(0);
      expect(after.lastFailure).toBeUndefined();
      expect(response.data.map(({ name }) => name)).toContain("greet");
    } finally {
      await workspace.close();
    }
  }, 30_000);
});

describe("Tier A language sessions", () => {
  it("serves Python symbols through the bundled Pyright session", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-python-lsp-"));
    roots.push(root);
    const source = path.join(root, "main.py");
    await writeFile(path.join(root, "pyproject.toml"), "[project]\nname='fixture'\nversion='0.0.0'\n");
    await writeFile(
      source,
      [
        "def greet(name: str) -> str:",
        "    return f'Hello {name}'",
        "def use_greet(name: str) -> str:",
        "    return greet(name)",
        "",
      ].join("\n"),
    );
    const manager = new LspManager();
    const workspace = await LspWorkspace.open(root, manager, "python");
    try {
      await workspace.synchronizeDocument(source);
      const response = await workspace.request<DocumentSymbol[]>(
        "textDocument/documentSymbol",
        { textDocument: { uri: pathToFileURL(source).href } },
      );
      expect(response.data.map(({ name }) => name)).toContain("greet");
      expect(manager.snapshots()[0]).toMatchObject({
        adapterId: "python",
        state: "ready",
      });
      expect(manager.snapshots()[0]!.normalizedCapabilities).toMatchObject({
        hover: "native",
        definition: "native",
        references: "native",
        rename: "native",
        pushDiagnostics: "native",
      });
      const textDocument = { uri: pathToFileURL(source).href };
      const position = { line: 3, character: 12 };
      let hover: Hover | null = null;
      for (let attempt = 0; attempt < 50 && !hover; attempt += 1) {
        hover = (await workspace.request<Hover | null>(
          "textDocument/hover", { textDocument, position }
        )).data;
        if (!hover) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(hover).not.toBeNull();
      expect((await workspace.request<Location | Location[] | LocationLink[] | null>(
        "textDocument/definition", { textDocument, position }
      )).data).not.toBeNull();
      expect((await workspace.request<Location[] | null>(
        "textDocument/references",
        { textDocument, position, context: { includeDeclaration: true } },
      )).data?.length).toBeGreaterThan(0);
      expect((await workspace.request<WorkspaceEdit | null>(
        "textDocument/rename", { textDocument, position, newName: "welcome" }
      )).data).not.toBeNull();
      if (manager.snapshots()[0]!.normalizedCapabilities.codeAction === "native") {
        const actions = await workspace.request<Array<CodeAction | Command> | null>(
          "textDocument/codeAction",
          {
            textDocument,
            range: { start: position, end: position },
            context: { diagnostics: [] },
          },
        );
        if (actions.data) expect(Array.isArray(actions.data)).toBe(true);
      }
      const before = manager.snapshots()[0]!.epoch;
      await manager.restart("python");
      expect(manager.snapshots()[0]!.epoch).toBe(before + 1);
    } finally {
      await workspace.close();
    }
  }, 30_000);

  const rustTest = process.env.ORYNT_TEST_RUST_LSP === "1" ? it : it.skip;
  rustTest("serves Rust symbols through the pinned CI toolchain", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-rust-lsp-"));
    roots.push(root);
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(path.join(root, "src"), { recursive: true })
    );
    const source = path.join(root, "src", "lib.rs");
    await writeFile(
      path.join(root, "Cargo.toml"),
      "[package]\nname='fixture'\nversion='0.1.0'\nedition='2021'\n",
    );
    await writeFile(
      source,
      [
        "pub fn greet(name: &str) -> String { format!(\"Hello {name}\") }",
        "pub fn use_greet(name: &str) -> String {",
        "    greet(name)",
        "}",
        "",
      ].join("\n"),
    );
    const manager = new LspManager();
    const workspace = await LspWorkspace.open(root, manager, "rust");
    try {
      await workspace.synchronizeDocument(source);
      const response = await workspace.request<DocumentSymbol[]>(
        "textDocument/documentSymbol",
        { textDocument: { uri: pathToFileURL(source).href } },
        { timeoutMs: 30_000 },
      );
      expect(response.data.map(({ name }) => name)).toContain("greet");
      const textDocument = { uri: pathToFileURL(source).href };
      const position = { line: 2, character: 6 };
      let hover: Hover | null = null;
      for (let attempt = 0; attempt < 50 && !hover; attempt += 1) {
        hover = (await workspace.request<Hover | null>(
          "textDocument/hover", { textDocument, position }
        )).data;
        if (!hover) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(hover).not.toBeNull();
      expect((await workspace.request<Location | Location[] | LocationLink[] | null>(
        "textDocument/definition", { textDocument, position }
      )).data).not.toBeNull();
      expect((await workspace.request<Location[] | null>(
        "textDocument/references",
        { textDocument, position, context: { includeDeclaration: true } },
      )).data?.length).toBeGreaterThan(0);
      expect((await workspace.request<WorkspaceEdit | null>(
        "textDocument/rename", { textDocument, position, newName: "welcome" }
      )).data).not.toBeNull();
      if (manager.snapshots()[0]!.normalizedCapabilities.codeAction === "native") {
        const actions = await workspace.request<Array<CodeAction | Command> | null>(
          "textDocument/codeAction",
          {
            textDocument,
            range: { start: position, end: position },
            context: { diagnostics: [] },
          },
        );
        if (actions.data) expect(Array.isArray(actions.data)).toBe(true);
      }
      const before = manager.snapshots()[0]!.epoch;
      await manager.restart("rust");
      expect(manager.snapshots()[0]!.epoch).toBe(before + 1);
    } finally {
      await workspace.close();
    }
  }, 60_000);
});

describe("Tier B bundled language sessions", () => {
  it("initializes each bundled adapter and serves its declared read subset", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-tier-b-lsp-"));
    roots.push(root);
    await writeFile(path.join(root, "package.json"), "{\"name\":\"fixture\"}\n");
    await writeFile(path.join(root, ".yamllint"), "---\n");
    const fixtures = [
      { adapterId: "json", path: "fixture.json", content: "{\"answer\":42}\n" },
      { adapterId: "yaml", path: "fixture.yaml", content: "answer: 42\n" },
      { adapterId: "html", path: "fixture.html", content: "<main id=\"answer\"></main>\n" },
      { adapterId: "css", path: "fixture.css", content: ".answer { color: red; }\n" },
      { adapterId: "bash", path: "fixture.sh", content: "answer() { echo 42; }\n" },
    ];
    for (const fixture of fixtures) {
      await writeFile(path.join(root, fixture.path), fixture.content);
    }
    const manager = new LspManager({ maxSessions: fixtures.length });
    try {
      for (const fixture of fixtures) {
        const workspace = await LspWorkspace.open(
          root,
          manager,
          fixture.adapterId,
        );
        const source = path.join(root, fixture.path);
        const document = await workspace.synchronizeDocument(source);
        const snapshot = manager.snapshots().find(
          ({ adapterId }) => adapterId === fixture.adapterId,
        );
        expect(snapshot).toMatchObject({
          adapterId: fixture.adapterId,
          state: "ready",
        });
        expect(snapshot?.normalizedCapabilities.documentSync).not.toBe("none");
        if (snapshot?.normalizedCapabilities.documentSymbols === "native") {
          const symbols = await workspace.request<DocumentSymbol[]>(
            "textDocument/documentSymbol",
            { textDocument: { uri: document.uri } },
          );
          expect(Array.isArray(symbols.data)).toBe(true);
        }
        await workspace.close({ closeManager: false });
      }
    } finally {
      await manager.close();
    }
  }, 60_000);
});
