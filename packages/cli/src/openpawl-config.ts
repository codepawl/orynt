import * as fs from "fs/promises";
import * as path from "path";

export const OPENPAWL_CONFIG_FILE_NAME = "openpawl.config.json";

export interface OpenPawlConfigValidation {
  readonly writeTestCommand?: string;
  readonly maxRetries?: number;
}

export interface OpenPawlConfig {
  readonly validation?: OpenPawlConfigValidation;
}

export interface LoadedOpenPawlConfig {
  readonly config: OpenPawlConfig | null;
  readonly configPath: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeValidation(value: unknown, configPath: string): OpenPawlConfigValidation {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error(`Openpawl config at ${configPath} must define validation as a JSON object.`);
  }

  const writeTestCommand = value.writeTestCommand;
  if (writeTestCommand !== undefined && typeof writeTestCommand !== "string") {
    throw new Error(`Openpawl config at ${configPath} must set validation.writeTestCommand to a string.`);
  }

  const normalizedWriteTestCommand = typeof writeTestCommand === "string" ? writeTestCommand.trim() : undefined;
  if (normalizedWriteTestCommand === "") {
    throw new Error(`Openpawl config at ${configPath} must set validation.writeTestCommand to a non-empty string.`);
  }

  const maxRetries = value.maxRetries;
  if (maxRetries !== undefined && (typeof maxRetries !== "number" || !Number.isInteger(maxRetries) || maxRetries < 0)) {
    throw new Error(`Openpawl config at ${configPath} must set validation.maxRetries to a non-negative integer.`);
  }

  return {
    writeTestCommand: normalizedWriteTestCommand,
    maxRetries,
  };
}

export function parseOpenPawlConfig(raw: unknown, configPath: string): OpenPawlConfig {
  if (!isRecord(raw)) {
    throw new Error(`Openpawl config at ${configPath} must be a JSON object.`);
  }

  const validation = normalizeValidation(raw.validation, configPath);
  return {
    validation: (validation.writeTestCommand || validation.maxRetries !== undefined) ? validation : undefined,
  };
}

export async function loadOpenPawlConfig(
  repoRoot: string,
  explicitConfigPath?: string
): Promise<LoadedOpenPawlConfig> {
  const candidatePath = explicitConfigPath
    ? path.resolve(repoRoot, explicitConfigPath)
    : path.join(path.resolve(repoRoot), OPENPAWL_CONFIG_FILE_NAME);

  try {
    const raw = await fs.readFile(candidatePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return {
      config: parseOpenPawlConfig(parsed, candidatePath),
      configPath: candidatePath,
    };
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "ENOENT") {
      if (explicitConfigPath) {
        throw new Error(`Openpawl config file does not exist: ${candidatePath}`);
      }
      return { config: null, configPath: null };
    }

    throw new Error(
      `Failed to load Openpawl config from ${candidatePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function resolveRunTestCommand(options: {
  readonly dryRun: boolean;
  readonly explicitTestCommand?: string;
  readonly config: OpenPawlConfig | null;
}): string | undefined {
  const explicit = options.explicitTestCommand?.trim();
  if (explicit) {
    return explicit;
  }

  if (options.dryRun) {
    return undefined;
  }

  return options.config?.validation?.writeTestCommand?.trim() || undefined;
}
