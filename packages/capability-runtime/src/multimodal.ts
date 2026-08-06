import { createHash, randomUUID } from "node:crypto";
import { link, lstat, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  validateRepositoryAssetGenerationV1,
  validateSessionTrustGrantV1,
  type RepositoryAssetGenerationV1,
  type SessionTrustGrantV1,
} from "@codepawl/shared";

function canonicalTrustMaterial(input: Omit<SessionTrustGrantV1, "issuedAt" | "digest">): string {
  return JSON.stringify({
    schemaVersion: 1,
    repositoryRealpath: input.repositoryRealpath,
    provider: input.provider,
    model: input.model,
    allowedOrigins: [...input.allowedOrigins].sort(),
    browserVision: true,
  });
}

export function sessionTrustDigest(
  input: Omit<SessionTrustGrantV1, "issuedAt" | "digest">,
): string {
  return createHash("sha256").update(canonicalTrustMaterial(input)).digest("hex");
}

export class InMemorySessionTrust {
  private grant?: SessionTrustGrantV1;

  proposal(input: Omit<SessionTrustGrantV1, "issuedAt" | "digest">): SessionTrustGrantV1 {
    return {
      ...input,
      allowedOrigins: [...input.allowedOrigins].sort(),
      issuedAt: new Date().toISOString(),
      digest: sessionTrustDigest(input),
    };
  }

  accept(proposal: SessionTrustGrantV1, acceptedDigest: string): void {
    validateSessionTrustGrantV1(proposal);
    const expected = sessionTrustDigest(proposal);
    if (proposal.digest !== expected || acceptedDigest !== expected) {
      throw new Error("Session trust digest does not match the current repository, model, or browser scope");
    }
    this.grant = structuredClone(proposal);
  }

  require(input: Omit<SessionTrustGrantV1, "issuedAt" | "digest">): SessionTrustGrantV1 {
    if (!this.grant || this.grant.digest !== sessionTrustDigest(input)) {
      this.grant = undefined;
      throw new Error("Browser vision requires an accepted trust grant for this session");
    }
    return structuredClone(this.grant);
  }

  clear(): void {
    this.grant = undefined;
  }
}

export type GeneratedAssetPayload = {
  outputPath: string;
  base64: string;
  provider: string;
  model: string;
  revisedPrompt?: string;
};

function expectedMime(format: RepositoryAssetGenerationV1["format"]): string {
  return format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
}

function detectMime(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return undefined;
}

export async function writeGeneratedRepositoryAssets(input: {
  repositoryRoot: string;
  request: RepositoryAssetGenerationV1;
  assets: GeneratedAssetPayload[];
}): Promise<Array<{ path: string; sha256: string; byteLength: number }>> {
  validateRepositoryAssetGenerationV1(input.request);
  if (input.assets.length !== input.request.outputPaths.length) {
    throw new Error("Generated asset count does not match the approved output paths");
  }
  const root = await realpath(input.repositoryRoot);
  const provenanceAbsolute = path.resolve(root, input.request.provenancePath);
  const provenanceParent = await realpath(path.dirname(provenanceAbsolute));
  if (provenanceParent !== root && !provenanceParent.startsWith(`${root}${path.sep}`)) {
    throw new Error("Asset provenance path resolves outside the repository");
  }
  const provenance = await readFile(provenanceAbsolute, "utf8");
  const expectedPaths = new Set(input.request.outputPaths);
  const written: Array<{ path: string; sha256: string; byteLength: number }> = [];
  for (const asset of input.assets) {
    if (!expectedPaths.delete(asset.outputPath)) throw new Error("Generated asset is outside the approved output set");
    const absolute = path.resolve(root, asset.outputPath);
    const parent = await realpath(path.dirname(absolute));
    if (parent !== root && !parent.startsWith(`${root}${path.sep}`)) {
      throw new Error("Generated asset parent resolves outside the repository");
    }
    const bytes = Buffer.from(asset.base64, "base64");
    if (bytes.length === 0 || detectMime(bytes) !== expectedMime(input.request.format)) {
      throw new Error(`Generated asset has invalid ${input.request.format} bytes`);
    }
    if (input.request.mode === "create") {
      await lstat(absolute).then(
        () => { throw new Error(`Generated asset already exists: ${asset.outputPath}`); },
        (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        },
      );
    }
    const temporary = path.join(parent, `.orynt-${randomUUID()}.tmp`);
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    if (input.request.mode === "create") {
      try {
        await link(temporary, absolute);
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
    } else {
      await rename(temporary, absolute);
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    written.push({ path: asset.outputPath, sha256, byteLength: bytes.length });
  }

  const lines = input.assets.map((asset, index) => {
    const evidence = written[index]!;
    return `- \`${asset.outputPath}\` — generated by ${asset.provider}/${asset.model}; sha256 \`${evidence.sha256}\`; prompt: ${JSON.stringify(asset.revisedPrompt ?? input.request.prompt)}.`;
  });
  const temporary = path.join(path.dirname(provenanceAbsolute), `.orynt-${randomUUID()}.tmp`);
  await writeFile(temporary, `${provenance.trimEnd()}\n${lines.join("\n")}\n`, { mode: 0o600, flag: "wx" });
  await rename(temporary, provenanceAbsolute);
  return written;
}
