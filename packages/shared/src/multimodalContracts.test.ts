import { describe, expect, it } from "bun:test";

import {
  validateRepositoryAssetGenerationV1,
  validateSessionTrustGrantV1,
} from "./multimodalContracts";

describe("multimodal contracts", () => {
  it("accepts exact-origin session trust and rejects wildcard-like origins", () => {
    expect(() => validateSessionTrustGrantV1({
      schemaVersion: 1,
      repositoryRealpath: "/repo",
      provider: "openai_responses",
      model: "gpt-5.6",
      allowedOrigins: ["https://example.com"],
      browserVision: true,
      issuedAt: "2026-08-03T00:00:00.000Z",
      digest: "a".repeat(64),
    })).not.toThrow();
    expect(() => validateSessionTrustGrantV1({
      schemaVersion: 1,
      repositoryRealpath: "/repo",
      provider: "openai_responses",
      model: "gpt-5.6",
      allowedOrigins: ["https://*.example.com"],
      browserVision: true,
      issuedAt: "2026-08-03T00:00:00.000Z",
      digest: "a".repeat(64),
    })).toThrow();
  });

  it("requires explicit bounded raster asset outputs and provenance ownership", () => {
    expect(() => validateRepositoryAssetGenerationV1({
      schemaVersion: 1,
      prompt: "Create an app icon",
      outputPaths: ["assets/generated/icon.png"],
      format: "png",
      mode: "create",
      provenancePath: "assets/PROVENANCE.md",
      explicitUserRequest: true,
      maxOutputs: 1,
    })).not.toThrow();
  });
});
