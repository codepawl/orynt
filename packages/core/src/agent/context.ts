import * as fs from "fs/promises";
import * as path from "path";
import { isSecretFile, SCAN_IGNORED_DIRS } from "../safety";
import type {
  RepoScanResult,
  ContextPack,
  ContextPackBudget,
  ContextPackFileSummary,
  ContextPackMetrics,
} from "../state/schema";

export const DEFAULT_CONTEXT_MAX_FILES = 60;
export const DEFAULT_CONTEXT_MAX_BYTES = 64_000;
export const DEFAULT_CONTEXT_MAX_CHARS = 12_000;

const MAX_EXCERPT_CHARS = 320;
const SMALL_FULL_FILE_BYTES = 1_500;
const MAX_OMITTED_NOTES = 12;

const BINARY_FILE_EXTENSION_RE =
  /\.(png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|otf|mp4|webm|mp3|pdf|zip|tar|gz|rar|bin|exe|dll|so|dylib)$/i;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "can",
  "do",
  "for",
  "from",
  "how",
  "if",
  "in",
  "is",
  "it",
  "its",
  "into",
  "of",
  "on",
  "out",
  "over",
  "should",
  "so",
  "that",
  "the",
  "to",
  "was",
  "with",
  "within",
]);

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".rs": "Rust",
  ".go": "Go",
  ".java": "Java",
  ".cpp": "C++",
  ".c": "C",
  ".h": "C/C++",
  ".cs": "C#",
  ".sh": "Shell",
  ".md": "Markdown",
};

interface ContextPackInput {
  readonly workspaceRoot: string;
  readonly task: string;
  readonly repoScan: RepoScanResult;
  readonly maxFiles?: number;
  readonly maxBytes?: number;
  readonly maxChars?: number;
  readonly testCommand?: string;
  readonly safetyExclusions?: ReadonlyArray<string>;
}

export interface EnvironmentContextConfig {
  readonly OPENPAWL_CONTEXT_MAX_FILES?: string;
  readonly OPENPAWL_CONTEXT_MAX_BYTES?: string;
  readonly OPENPAWL_CONTEXT_MAX_CHARS?: string;
}

function normalizeLimit(value: string | number | undefined, fallback: number): number {
  const candidate = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(candidate) || !Number.isInteger(candidate) || candidate <= 0) {
    return fallback;
  }
  return Math.floor(candidate);
}

function extractTaskTokens(task: string): string[] {
  return task
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function languageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_EXTENSIONS[ext] ?? "Text";
}

function isIgnoredPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").some((segment) => SCAN_IGNORED_DIRS.has(segment));
}

function isBinaryPath(filePath: string): boolean {
  return BINARY_FILE_EXTENSION_RE.test(filePath);
}

function fileRelevanceScore(filePath: string, taskTokens: string[]): number {
  const lower = filePath.toLowerCase();
  let score = 0;
  for (const token of taskTokens) {
    if (token.length > 0 && lower.includes(token)) {
      score += 12;
    }
  }
  const segments = lower.split("/");
  if (segments.includes("packages")) score += 3;
  if (segments.includes("src")) score += 2;
  if (segments.includes("test") || segments.includes("tests")) score += 2;
  if (segments.includes("core") || segments.includes("cli")) score += 1;
  return score;
}

function summarizeOmissions(notes: string[]): ReadonlyArray<string> {
  return Array.from(new Set(notes)).slice(0, MAX_OMITTED_NOTES);
}

async function readContextExcerpt(
  fullPath: string,
  shouldUseFullContent: boolean
): Promise<{ excerpt: string; truncated: boolean }> {
  const content = await fs.readFile(fullPath, "utf-8");
  const normalized = content.replace(/\s+/g, " ").trim();
  const excerpt = shouldUseFullContent
    ? normalized
    : normalized.slice(0, MAX_EXCERPT_CHARS);
  return {
    excerpt,
    truncated: normalized.length > excerpt.length,
  };
}

export function normalizeContextBudgets(input: {
  maxFiles?: number;
  maxBytes?: number;
  maxChars?: number;
}): ContextPackBudget {
  return {
    maxFiles: normalizeLimit(input.maxFiles, DEFAULT_CONTEXT_MAX_FILES),
    maxBytes: normalizeLimit(input.maxBytes, DEFAULT_CONTEXT_MAX_BYTES),
    maxChars: normalizeLimit(input.maxChars, DEFAULT_CONTEXT_MAX_CHARS),
  };
}

export function resolveContextBudgets(
  input: {
    maxFiles?: number;
    maxBytes?: number;
    maxChars?: number;
  },
  env: EnvironmentContextConfig = {}
): ContextPackBudget {
  return normalizeContextBudgets({
    maxFiles: input.maxFiles ?? Number(env.OPENPAWL_CONTEXT_MAX_FILES),
    maxBytes: input.maxBytes ?? Number(env.OPENPAWL_CONTEXT_MAX_BYTES),
    maxChars: input.maxChars ?? Number(env.OPENPAWL_CONTEXT_MAX_CHARS),
  });
}

function buildSafetyExclusions(
  files: ReadonlyArray<{ path: string; isDir: boolean }>,
  safetyExclusions: string[] = []
): string[] {
  const exclusions = new Set<string>(safetyExclusions);
  exclusions.add(
    `ignored directories: ${Array.from(SCAN_IGNORED_DIRS).sort().join(", ")}`
  );
  const excludedBySecret = files.some((file) => !file.isDir && isSecretFile(file.path));
  if (excludedBySecret) {
    exclusions.add("secret-like files excluded during scan and compaction");
  }
  const excludedByBinary = files.some((file) => !file.isDir && isBinaryPath(file.path));
  if (excludedByBinary) {
    exclusions.add("binary files excluded by compaction layer");
  }
  return Array.from(exclusions).sort();
}

export async function createContextPack(input: ContextPackInput): Promise<ContextPack> {
  const budget = normalizeContextBudgets({
    maxFiles: input.maxFiles,
    maxBytes: input.maxBytes,
    maxChars: input.maxChars,
  });

  const task = input.task.trim();
  const taskTokens = extractTaskTokens(task);
  const allFiles = input.repoScan.files.filter((file) => !file.isDir);

  const scannedFiles = allFiles.length;
  const scannedBytes = allFiles.reduce((sum, file) => sum + file.sizeBytes, 0);
  const safetyExclusions = buildSafetyExclusions(allFiles, [...(input.safetyExclusions ?? [])]);

  const candidatePool = allFiles
    .filter((file) => !isIgnoredPath(file.path))
    .filter((file) => !isSecretFile(file.path))
    .filter((file) => !isBinaryPath(file.path))
    .map((file) => ({
      file,
      score: fileRelevanceScore(file.path, taskTokens),
    }))
    .sort((a, b) => (b.score - a.score) || a.file.path.localeCompare(b.file.path));

  const compactFileSummaries: ContextPackFileSummary[] = [];
  const workspaceHints = new Set<string>();
  const omittedContextNotes: string[] = [];
  const seenCandidatePaths = new Set<string>();
  let includedBytes = 0;
  let includedContextChars = 0;
  let compactionReason = "none";

  const candidatePaths = candidatePool.map((candidate) => candidate.file.path);
  for (const candidatePath of candidatePaths) {
    seenCandidatePaths.add(candidatePath);
  }

  for (const candidate of candidatePool) {
    const score = candidate.score;
    const relativePath = candidate.file.path;
    const isDirectMatch = score > 0;
    const includeReason = isDirectMatch ? "task-relevant path match" : "workspace scan relevance";

    if (compactFileSummaries.length >= budget.maxFiles) {
      compactionReason = "file_cap";
      omittedContextNotes.push(`omitted file due file budget: ${relativePath}`);
      continue;
    }
    if (includedBytes + candidate.file.sizeBytes > budget.maxBytes) {
      compactionReason = "byte_cap";
      omittedContextNotes.push(`omitted file due byte budget: ${relativePath}`);
      continue;
    }

    const shouldUseFullContent = isDirectMatch && candidate.file.sizeBytes <= SMALL_FULL_FILE_BYTES;
    const fullPath = path.join(input.workspaceRoot, relativePath);
    let excerptData: { excerpt: string; truncated: boolean };
    try {
      excerptData = await readContextExcerpt(fullPath, shouldUseFullContent);
    } catch {
      compactionReason = "read_error";
      omittedContextNotes.push(`omitted file because contents could not be read: ${relativePath}`);
      continue;
    }

    const candidateSummary = {
      path: relativePath,
      sizeBytes: candidate.file.sizeBytes,
      language: languageFromPath(relativePath),
      reason: includeReason,
      excerpt: excerptData.excerpt,
      isExcerptTruncated: excerptData.truncated,
    };
    const estimatedSummaryChars = JSON.stringify(candidateSummary).length;
    if (includedContextChars + estimatedSummaryChars > budget.maxChars) {
      compactionReason = "char_cap";
      omittedContextNotes.push(`omitted file due char budget: ${relativePath}`);
      continue;
    }

    compactFileSummaries.push(candidateSummary);
    includedBytes += candidate.file.sizeBytes;
    includedContextChars += estimatedSummaryChars;

    const segments = relativePath.split("/");
    if (segments.length >= 2) {
      workspaceHints.add(`${segments[0]}/${segments[1]}`);
    }
  }

  const compactContextWithoutPromptMetrics: Omit<ContextPack, "metrics"> = {
    taskSummary: task.length > 0 ? `Task: ${task}` : "Task: <empty>",
    repositoryRoot: input.repoScan.rootDir,
    candidateFiles: Array.from(seenCandidatePaths),
    compactFileSummaries,
    packageHints: input.repoScan.packageConfigs,
    workspaceHints: Array.from(workspaceHints),
    testCommandHints: [
      input.testCommand
        ? `explicit validation command: ${input.testCommand}`
        : "no explicit validation command provided",
      "validation fallback in dry-run: placeholder validation when omitted",
    ],
    safetyExclusions,
    omittedContextNotes: [],
    budget,
  };

  const compactContextEstimate = compactContextForPrompt(compactContextWithoutPromptMetrics as ContextPack, true);
  const estimatedContextChars = JSON.stringify(compactContextEstimate).length;
  const contextMetrics: ContextPackMetrics = {
    inputScannedFiles: scannedFiles,
    candidateFiles: seenCandidatePaths.size,
    includedFiles: compactFileSummaries.length,
    omittedFiles: Math.max(0, scannedFiles - compactFileSummaries.length),
    scannedBytes,
    includedBytes,
    omittedBytes: Math.max(0, scannedBytes - includedBytes),
    estimatedContextChars,
    compactionReason,
  };

  const finalOmittedNotes = summarizeOmissions([
    ...omittedContextNotes,
    `kept ${compactFileSummaries.length} of ${scannedFiles} scanned files`,
    `budget applied: files<=${budget.maxFiles}, bytes<=${budget.maxBytes}, chars<=${budget.maxChars}`,
    `compact context char cap = ${contextMetrics.estimatedContextChars} chars`,
  ]);

  return {
    ...compactContextWithoutPromptMetrics,
    budget,
    metrics: contextMetrics,
    omittedContextNotes: finalOmittedNotes,
  };
}

export function compactContextForPrompt(
  contextPack: ContextPack,
  includeAllCandidates = false
): {
  taskSummary: string;
  repository: {
    root: string;
    packages: ReadonlyArray<{ type: string; path: string }>;
    workspaces: ReadonlyArray<string>;
    budget: ContextPackBudget;
  };
  compactFileSummaries: ReadonlyArray<ContextPackFileSummary>;
  candidateFiles: ReadonlyArray<string>;
  notes: ReadonlyArray<string>;
  packageHints: ReadonlyArray<{ type: string; path: string }>;
  testCommandHints: ReadonlyArray<string>;
  safetyExclusions: ReadonlyArray<string>;
} {
  return {
    taskSummary: contextPack.taskSummary,
    repository: {
      root: contextPack.repositoryRoot,
      packages: contextPack.packageHints,
      workspaces: contextPack.workspaceHints,
      budget: contextPack.budget,
    },
    compactFileSummaries: contextPack.compactFileSummaries,
    candidateFiles: includeAllCandidates
      ? contextPack.candidateFiles
      : contextPack.compactFileSummaries.map((summary) => summary.path),
    notes: contextPack.omittedContextNotes,
    packageHints: contextPack.packageHints,
    testCommandHints: contextPack.testCommandHints,
    safetyExclusions: contextPack.safetyExclusions,
  };
}
