import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import { runAssetCli } from "./assets";

let root = "";

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

describe("asset CLI", () => {
  it("generates only from an explicit command and records provenance", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "orynt-asset-cli-"));
    await mkdir(path.join(root, "assets", "generated"), { recursive: true });
    await writeFile(path.join(root, "assets", "PROVENANCE.md"), "# Asset provenance\n");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB", "base64");
    const output: string[] = [];
    const status = await runAssetCli([
      "generate",
      "--prompt",
      "A simple icon",
      "--output",
      "assets/generated/icon.png",
    ], {
      cwd: root,
      env: {},
      write: (line) => output.push(line),
      generate: async () => [{
        outputPath: "",
        base64: png.toString("base64"),
        provider: "fixture",
        model: "fixture-image",
      }],
    });
    expect(status).toBe(0);
    expect(output[0]).toMatch(/Generated assets\/generated\/icon.png/u);
    expect(await readFile(path.join(root, "assets", "generated", "icon.png"))).toEqual(png);
  });

  it("fails closed instead of replacing an existing asset implicitly", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "orynt-asset-cli-"));
    await mkdir(path.join(root, "assets"), { recursive: true });
    await writeFile(path.join(root, "assets", "PROVENANCE.md"), "# Asset provenance\n");
    await writeFile(path.join(root, "assets", "icon.png"), "existing");
    const output: string[] = [];
    const status = await runAssetCli([
      "generate",
      "--prompt",
      "Icon",
      "--output",
      "assets/icon.png",
    ], {
      cwd: root,
      env: {},
      write: (line) => output.push(line),
      generate: async () => [{
        outputPath: "",
        base64: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB", "base64").toString("base64"),
        provider: "fixture",
        model: "fixture-image",
      }],
    });
    expect(status).toBe(1);
    expect(output).toEqual([expect.stringMatching(/already exists/iu)]);
    expect(await readFile(path.join(root, "assets", "icon.png"), "utf8")).toBe("existing");
  });
});
