import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "bun:test";

import { loadCustomLspAdapters, runLspCli } from "./lsp.js";

const roots: string[] = [];

async function fixture(): Promise<{ repositoryPath: string; stateRoot: string }> {
  const repositoryPath = await mkdtemp(
    path.join(os.tmpdir(), "orynt-lsp-repository-"),
  );
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "orynt-lsp-state-"));
  roots.push(repositoryPath, stateRoot);
  await writeFile(
    path.join(repositoryPath, "package.json"),
    JSON.stringify({ name: "fixture" }),
  );
  await writeFile(
    path.join(repositoryPath, "index.ts"),
    "export const answer = 42;\n",
  );
  return { repositoryPath, stateRoot };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("LSP CLI", () => {
  it("lists detected adapters as JSON without starting a server", async () => {
    const { repositoryPath, stateRoot } = await fixture();
    const output: string[] = [];
    const restart = vi.fn();
    const exitCode = await runLspCli(["list", "--json"], {
      cwd: repositoryPath,
      stateRoot,
      write: (value) => output.push(value),
      restart,
    });

    expect(exitCode).toBe(0);
    expect(restart).not.toHaveBeenCalled();
    const result = JSON.parse(output.join("\n")) as {
      adapters: Array<{
        id: string;
        tier: string;
        detected: { availability: string } | null;
      }>;
    };
    expect(
      result.adapters.find(({ id }) => id === "typescript")?.detected,
    ).toMatchObject({ availability: "bundled" });
    expect(result.adapters.find(({ id }) => id === "typescript")?.tier)
      .toBe("tier_a");
    expect(result.adapters.find(({ id }) => id === "rust")?.tier)
      .toBe("tier_a");
  });

  it("persists and removes a validated custom adapter", async () => {
    const { repositoryPath, stateRoot } = await fixture();
    const dependencies = {
      cwd: repositoryPath,
      stateRoot,
      write: vi.fn(),
      restart: vi.fn(),
    };
    await expect(
      runLspCli(
        [
          "add",
          "--id",
          "fixture-lsp",
          "--language",
          "fixture",
          "--extension",
          "fixture",
          "--root-marker",
          "fixture.config",
          "--command",
          process.execPath,
          "--arg=--stdio",
        ],
        dependencies,
      ),
    ).resolves.toBe(0);
    await expect(loadCustomLspAdapters(stateRoot)).resolves.toMatchObject([
      {
        id: "fixture-lsp",
        command: process.execPath,
        extensions: [".fixture"],
      },
    ]);

    await expect(
      runLspCli(["remove", "fixture-lsp"], dependencies),
    ).resolves.toBe(0);
    await expect(loadCustomLspAdapters(stateRoot)).resolves.toEqual([]);
  });

  it("rejects relative custom server executables", async () => {
    const { repositoryPath, stateRoot } = await fixture();
    await expect(
      runLspCli(
        [
          "add",
          "--id",
          "unsafe",
          "--language",
          "unsafe",
          "--extension",
          ".unsafe",
          "--command",
          "unsafe-language-server",
        ],
        {
          cwd: repositoryPath,
          stateRoot,
          write: vi.fn(),
          restart: vi.fn(),
        },
      ),
    ).rejects.toThrow(/absolute/u);
  });

  it("reports distribution readiness and an empty recovery queue", async () => {
    const { repositoryPath, stateRoot } = await fixture();
    const output: string[] = [];
    const dependencies = {
      cwd: repositoryPath,
      stateRoot,
      write: (value: string) => output.push(value),
      restart: vi.fn(),
    };
    const previous = process.env.ORYNT_INSTALL_KIND;
    delete process.env.ORYNT_INSTALL_KIND;
    try {
      await expect(runLspCli(["doctor", "--json"], dependencies)).resolves.toBe(0);
      const doctor = JSON.parse(output.join("\n")) as {
        runtime: { status: string; distribution: string };
        recovery: unknown[];
      };
      expect(doctor.runtime).toEqual({
        distribution: "npm",
        status: "available",
        reason: null,
      });
      expect(doctor.recovery).toEqual([]);
      output.length = 0;
      await expect(runLspCli(["recovery", "list", "--json"], dependencies))
        .resolves.toBe(0);
      expect(JSON.parse(output.join("\n"))).toEqual({ recovery: [] });
    } finally {
      if (previous === undefined) delete process.env.ORYNT_INSTALL_KIND;
      else process.env.ORYNT_INSTALL_KIND = previous;
    }
  });

  it("requires an exact two-step approval for headless rename apply", async () => {
    const { repositoryPath, stateRoot } = await fixture();
    const output: string[] = [];
    const dependencies = {
      cwd: repositoryPath,
      stateRoot,
      write: (value: string) => output.push(value),
      restart: vi.fn(),
    };
    expect(await runLspCli([
      "refactor",
      "rename-preview",
      "--path",
      "index.ts",
      "--line",
      "1",
      "--column",
      "14",
      "--new-name",
      "result",
      "--json",
    ], dependencies)).toBe(0);
    const preview = JSON.parse(output.pop()!).data.preview as {
      previewId: string;
      previewDigest: string;
    };

    expect(await runLspCli([
      "refactor",
      "apply",
      "--preview-id",
      preview.previewId,
      "--preview-digest",
      preview.previewDigest,
      "--json",
    ], dependencies)).toBe(2);
    expect(await readFile(path.join(repositoryPath, "index.ts"), "utf8"))
      .toContain("const answer");

    expect(await runLspCli([
      "refactor",
      "apply",
      "--preview-id",
      preview.previewId,
      "--preview-digest",
      preview.previewDigest,
      "--approve-once",
      "--json",
    ], dependencies)).toBe(0);
    expect(await readFile(path.join(repositoryPath, "index.ts"), "utf8"))
      .toContain("const result");
  }, 60_000);
});
