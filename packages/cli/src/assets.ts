import { realpath } from "node:fs/promises";

import { CodexAppServerRuntime } from "@codepawl/codex-adapter";
import {
  writeGeneratedRepositoryAssets,
  type GeneratedAssetPayload,
} from "@codepawl/capability-runtime";
import { ResponsesAgentRuntime } from "@codepawl/model-runtime";
import type { RepositoryAssetFormat } from "@codepawl/shared";

export type AssetCliDependencies = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  write(value: string): void;
  confirm?: (prompt: string) => Promise<boolean>;
  recordMemoryExemption?: (input: {
    operation: string;
    reason: "asset_generation";
    transport: string;
    modelId: string;
    input: string;
  }) => Promise<void>;
  generate?: (input: {
    provider: "responses" | "app-server";
    model: string;
    prompt: string;
    format: RepositoryAssetFormat;
    count: number;
    cwd: string;
  }) => Promise<GeneratedAssetPayload[]>;
};

function values(args: string[], flag: string): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== flag) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    result.push(value);
    index += 1;
  }
  return result;
}

function value(args: string[], flag: string): string | undefined {
  const entries = values(args, flag);
  if (entries.length > 1) throw new Error(`${flag} may be provided only once`);
  return entries[0];
}

async function generateWithProvider(input: {
  provider: "responses" | "app-server";
  model: string;
  prompt: string;
  format: RepositoryAssetFormat;
  count: number;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<GeneratedAssetPayload[]> {
  const instruction = [
    `Generate exactly ${input.count} ${input.format.toUpperCase()} repository asset image(s).`,
    "This is an explicit user-requested asset generation turn. Do not edit repository files.",
    input.prompt,
  ].join("\n");
  if (input.provider === "responses") {
    const runtime = new ResponsesAgentRuntime({
      apiKey: input.env.OPENAI_API_KEY,
    });
    try {
      const session = await runtime.startSession({
        sessionId: `asset-${Date.now()}`,
        role: "implementer",
        model: input.model,
        effort: "medium",
        instructions: "Generate only the explicitly requested images. Return no unrelated work.",
        imageGeneration: {
          enabled: true,
          maxOutputs: input.count as 1 | 2 | 3 | 4,
          format: input.format,
        },
      });
      const result = await session.runTurn({ text: instruction });
      return (result.generatedImages ?? [])
        .filter((image) => image.status === "completed" && image.base64)
        .map((image) => ({
          outputPath: "",
          base64: image.base64!,
          provider: "openai_responses",
          model: input.model,
          revisedPrompt: image.revisedPrompt,
        }));
    } finally {
      await runtime.close();
    }
  }
  const runtime = new CodexAppServerRuntime({ env: input.env });
  try {
    const capabilities = await runtime.readModelProviderCapabilities();
    if (!capabilities.imageGeneration) {
      throw new Error("Selected Codex provider does not advertise image generation");
    }
    const result = await runtime.runTurn({
      prompt: instruction,
      cwd: input.cwd,
      model: input.model,
      effort: "medium",
      sandbox: "read-only",
    });
    return result.generatedImages
      .filter((image) => image.status === "completed" && image.base64)
      .map((image) => ({
        outputPath: "",
        base64: image.base64!,
        provider: "codex_app_server",
        model: input.model,
        revisedPrompt: image.revisedPrompt,
      }));
  } finally {
    await runtime.shutdown();
  }
}

export async function runAssetCli(
  args: string[],
  dependencies: AssetCliDependencies,
): Promise<number> {
  if (args[0] !== "generate") {
    dependencies.write(
      "Usage: orynt assets generate --prompt <text> --output <path> [--output <path>] [--format png|webp|jpeg] [--provider app-server|responses] [--model <id>] [--replace]",
    );
    return args[0] ? 2 : 0;
  }
  try {
    const prompt = value(args, "--prompt")?.trim();
    const outputPaths = values(args, "--output");
    const format = (value(args, "--format") ?? "png") as RepositoryAssetFormat;
    const provider = (value(args, "--provider") ?? "app-server") as "responses" | "app-server";
    const model = value(args, "--model") ?? "gpt-5.6";
    const replace = args.includes("--replace");
    if (!prompt) throw new Error("--prompt is required");
    if (outputPaths.length < 1 || outputPaths.length > 4) {
      throw new Error("Provide one to four --output paths");
    }
    if (!["png", "webp", "jpeg"].includes(format)) throw new Error("--format must be png, webp, or jpeg");
    if (!["responses", "app-server"].includes(provider)) throw new Error("--provider must be app-server or responses");
    if (replace && !await dependencies.confirm?.(`Replace ${outputPaths.length} asset file(s)?`)) {
      throw new Error("Asset replacement was not approved");
    }
    const repositoryRoot = await realpath(dependencies.cwd);
    await dependencies.recordMemoryExemption?.({
      operation: "assets.generate",
      reason: "asset_generation",
      transport: provider === "responses"
        ? "openai-responses"
        : "codex-app-server",
      modelId: model,
      input: prompt,
    });
    const generated = await (dependencies.generate
      ? dependencies.generate({ provider, model, prompt, format, count: outputPaths.length, cwd: repositoryRoot })
      : generateWithProvider({
          provider,
          model,
          prompt,
          format,
          count: outputPaths.length,
          cwd: repositoryRoot,
          env: dependencies.env,
        }));
    if (generated.length !== outputPaths.length) {
      throw new Error(`Provider returned ${generated.length} usable image(s); expected ${outputPaths.length}`);
    }
    const evidence = await writeGeneratedRepositoryAssets({
      repositoryRoot,
      request: {
        schemaVersion: 1,
        prompt,
        outputPaths,
        format,
        mode: replace ? "replace" : "create",
        provenancePath: "assets/PROVENANCE.md",
        explicitUserRequest: true,
        maxOutputs: outputPaths.length as 1 | 2 | 3 | 4,
      },
      assets: generated.map((asset, index) => ({ ...asset, outputPath: outputPaths[index]! })),
    });
    for (const asset of evidence) {
      dependencies.write(`Generated ${asset.path} (${asset.byteLength} bytes, sha256 ${asset.sha256})`);
    }
    return 0;
  } catch (error) {
    dependencies.write(`Asset generation failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
