import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import {
  InMemorySessionTrust,
  writeGeneratedRepositoryAssets,
} from "./multimodal";

let root = "";

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

describe("multimodal capability policy", () => {
  it("keeps trust memory-only and invalidates it when the model or scope changes", () => {
    const trust = new InMemorySessionTrust();
    const material = {
      schemaVersion: 1 as const,
      repositoryRealpath: "/repo",
      provider: "codex_app_server" as const,
      model: "gpt-5.6",
      allowedOrigins: ["https://example.com"],
      browserVision: true as const,
    };
    const proposal = trust.proposal(material);
    trust.accept(proposal, proposal.digest);
    expect(trust.require(material).digest).toBe(proposal.digest);
    expect(() => trust.require({ ...material, model: "gpt-5.6-terra" })).toThrow(
      /accepted trust grant/iu,
    );
  });

  it("writes only approved raster paths and appends verifiable provenance", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "orynt-assets-"));
    await mkdir(path.join(root, "assets", "generated"), { recursive: true });
    await writeFile(path.join(root, "assets", "PROVENANCE.md"), "# Asset provenance\n");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB", "base64");
    const written = await writeGeneratedRepositoryAssets({
      repositoryRoot: root,
      request: {
        schemaVersion: 1,
        prompt: "A restrained application icon",
        outputPaths: ["assets/generated/icon.png"],
        format: "png",
        mode: "create",
        provenancePath: "assets/PROVENANCE.md",
        explicitUserRequest: true,
        maxOutputs: 1,
      },
      assets: [{
        outputPath: "assets/generated/icon.png",
        base64: png.toString("base64"),
        provider: "openai_responses",
        model: "gpt-image",
      }],
    });
    expect(written).toEqual([expect.objectContaining({
      path: "assets/generated/icon.png",
      byteLength: png.length,
    })]);
    expect(await readFile(path.join(root, "assets", "generated", "icon.png"))).toEqual(png);
    expect(await readFile(path.join(root, "assets", "PROVENANCE.md"), "utf8")).toContain(
      "openai_responses/gpt-image",
    );
  });
});
