import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import type {
  AgentSkillManifestV1,
  InstalledSkillRecord,
  SkillCollision,
  SkillScope,
  SkillSourceDescriptor,
} from "@codepawl/shared";

const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_ENTRIES = 2_000;
const DEFAULT_MAX_MANIFEST_BYTES = 512 * 1024;
const DEFAULT_MAX_BUNDLE_BYTES = 50 * 1024 * 1024;

export class SkillPackageFailure extends Error {
  constructor(
    readonly code:
      | "invalid_manifest"
      | "unsafe_path"
      | "scan_limit_exceeded"
      | "stale_plan"
      | "digest_mismatch"
      | "local_drift"
      | "skill_not_found"
      | "not_receipt_owned"
      | "collision",
    message: string,
  ) {
    super(message);
    this.name = "SkillPackageFailure";
  }
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => parseScalar(item));
  }
  return trimmed;
}

/**
 * Deliberately bounded YAML subset for Agent Skills frontmatter. It accepts
 * mappings, nested mappings, inline arrays, and literal/folded blocks. YAML
 * aliases, tags, merge keys, and arbitrary object construction are rejected.
 */
export function parseSkillFrontmatter(frontmatter: string): Record<string, unknown> {
  if (frontmatter.includes("\0") || /(^|\s)[&*!][^\s]*/m.test(frontmatter) || /^\s*<<\s*:/m.test(frontmatter)) {
    throw new SkillPackageFailure("invalid_manifest", "YAML aliases, tags, and merge keys are not supported");
  }
  const root: Record<string, unknown> = Object.create(null);
  const stack: Array<{ indent: number; value: Record<string, unknown> }> = [{ indent: -1, value: root }];
  const lines = frontmatter.replace(/\r\n?/g, "\n").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (line.includes("\t")) throw new SkillPackageFailure("invalid_manifest", "tabs are not allowed in frontmatter");
    const indent = line.length - line.trimStart().length;
    const match = line.trim().match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) throw new SkillPackageFailure("invalid_manifest", `invalid frontmatter line ${index + 1}`);
    while (stack.at(-1)!.indent >= indent) stack.pop();
    const target = stack.at(-1)?.value;
    if (!target) throw new SkillPackageFailure("invalid_manifest", `invalid indentation on line ${index + 1}`);
    const key = match[1];
    if (Object.hasOwn(target, key)) throw new SkillPackageFailure("invalid_manifest", `duplicate frontmatter key: ${key}`);
    const rawValue = match[2];
    const blockStyle = rawValue.match(/^([|>])[-+]?$/)?.[1];
    if (blockStyle) {
      const block: string[] = [];
      while (index + 1 < lines.length) {
        const next = lines[index + 1];
        const nextIndent = next.length - next.trimStart().length;
        if (next.trim() && nextIndent <= indent) break;
        index += 1;
        block.push(next.slice(Math.min(next.length, indent + 2)));
      }
      target[key] =
        blockStyle === ">"
          ? block.join(" ").replace(/\s+/g, " ").trim()
          : block.join("\n");
    } else if (!rawValue) {
      const nested: Record<string, unknown> = Object.create(null);
      target[key] = nested;
      stack.push({ indent, value: nested });
    } else {
      target[key] = parseScalar(rawValue);
    }
  }
  return root;
}

function stringField(value: unknown, name: string, required = false): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new SkillPackageFailure("invalid_manifest", `${name} must be a non-empty string`);
  }
  return value.trim();
}

export function parseAgentSkillDocument(document: string): { manifest: AgentSkillManifestV1; instructions: string } {
  const normalized = document.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new SkillPackageFailure("invalid_manifest", "SKILL.md must start with YAML frontmatter");
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) throw new SkillPackageFailure("invalid_manifest", "SKILL.md frontmatter is not closed");
  const raw = parseSkillFrontmatter(normalized.slice(4, end));
  const name = stringField(raw.name, "name", true)!;
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(name)) {
    throw new SkillPackageFailure("invalid_manifest", "name contains unsupported characters");
  }
  const description = stringField(raw.description, "description", true)!;
  const metadata =
    raw.metadata === undefined
      ? {}
      : raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : (() => {
            throw new SkillPackageFailure("invalid_manifest", "metadata must be a mapping");
          })();
  const allowedValue = raw["allowed-tools"] ?? raw.allowedTools;
  const allowedTools =
    allowedValue === undefined
      ? []
      : Array.isArray(allowedValue) && allowedValue.every((item) => typeof item === "string")
        ? allowedValue
        : typeof allowedValue === "string"
          ? allowedValue.split(/\s+/).filter(Boolean)
          : (() => {
              throw new SkillPackageFailure("invalid_manifest", "allowed-tools must be a string or string array");
            })();
  return {
    manifest: {
      schemaVersion: 1,
      name,
      description,
      license: stringField(raw.license, "license"),
      compatibility: stringField(raw.compatibility, "compatibility"),
      metadata,
      allowedTools,
      rawFrontmatter: raw,
    },
    instructions: normalized.slice(end + 5),
  };
}

export type FingerprintResult = {
  digest: string;
  files: Array<{ path: string; size: number; sha256: string }>;
  totalBytes: number;
};

async function listBundleFiles(
  root: string,
  current: string,
  files: string[],
  limits: Required<Pick<SkillScanOptions, "maxDepth" | "maxEntries" | "maxBundleBytes">>,
  depth = 0,
): Promise<number> {
  if (depth > limits.maxDepth) throw new SkillPackageFailure("scan_limit_exceeded", `bundle exceeds max depth ${limits.maxDepth}`);
  let total = 0;
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (files.length >= limits.maxEntries) {
      throw new SkillPackageFailure("scan_limit_exceeded", `bundle exceeds max entries ${limits.maxEntries}`);
    }
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) throw new SkillPackageFailure("unsafe_path", `symbolic link is not allowed: ${relative}`);
    if (stat.isDirectory()) {
      total += await listBundleFiles(root, absolute, files, limits, depth + 1);
      if (total > limits.maxBundleBytes) {
        throw new SkillPackageFailure("scan_limit_exceeded", `bundle exceeds ${limits.maxBundleBytes} bytes`);
      }
    } else if (stat.isFile()) {
      if (stat.nlink > 1) throw new SkillPackageFailure("unsafe_path", `hard link is not allowed: ${relative}`);
      files.push(relative);
      total += stat.size;
      if (total > limits.maxBundleBytes) {
        throw new SkillPackageFailure("scan_limit_exceeded", `bundle exceeds ${limits.maxBundleBytes} bytes`);
      }
    } else {
      throw new SkillPackageFailure("unsafe_path", `special file is not allowed: ${relative}`);
    }
  }
  return total;
}

export async function fingerprintSkillDirectory(
  skillPath: string,
  options: Pick<SkillScanOptions, "maxDepth" | "maxEntries" | "maxBundleBytes"> = {},
): Promise<FingerprintResult> {
  const canonical = await realpath(skillPath);
  const files: string[] = [];
  const limits = {
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxBundleBytes: options.maxBundleBytes ?? DEFAULT_MAX_BUNDLE_BYTES,
  };
  const totalBytes = await listBundleFiles(canonical, canonical, files, limits);
  const aggregate = createHash("sha256");
  const details: FingerprintResult["files"] = [];
  for (const relative of files.sort()) {
    const bytes = await readFile(path.join(canonical, relative));
    const executableBinary =
      (bytes[0] === 0x7f && bytes.subarray(1, 4).toString("ascii") === "ELF") ||
      (bytes[0] === 0x4d && bytes[1] === 0x5a) ||
      ["feedface", "feedfacf", "cafebabe", "cffaedfe", "cefaedfe"].includes(bytes.subarray(0, 4).toString("hex"));
    if (executableBinary) throw new SkillPackageFailure("unsafe_path", `executable binary is not allowed: ${relative}`);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    aggregate.update(Buffer.from(relative, "utf8"));
    aggregate.update(Buffer.from([0]));
    aggregate.update(Buffer.from(String(bytes.length), "utf8"));
    aggregate.update(Buffer.from([0]));
    aggregate.update(bytes);
    details.push({ path: relative, size: bytes.length, sha256 });
  }
  return { digest: aggregate.digest("hex"), files: details, totalBytes };
}

export type SkillScanRoot = {
  path: string;
  scope: SkillScope;
  source: SkillSourceDescriptor;
};

export type SkillScanOptions = {
  roots: SkillScanRoot[];
  maxDepth?: number;
  maxEntries?: number;
  maxManifestBytes?: number;
  maxBundleBytes?: number;
  now?: () => string;
};

export type SkillScanResult = {
  installed: InstalledSkillRecord[];
  collisions: SkillCollision[];
};

export async function scanAgentSkillRoots(options: SkillScanOptions): Promise<SkillScanResult> {
  const installed: InstalledSkillRecord[] = [];
  const realpaths = new Map<string, string>();
  const timestamp = (options.now ?? (() => new Date().toISOString()))();
  for (const root of options.roots) {
    let entries;
    try {
      entries = await readdir(root.path, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const skillPath = path.join(root.path, entry.name);
      const canonical = await realpath(skillPath);
      const duplicate = realpaths.get(canonical);
      if (duplicate) {
        installed.push({
          id: `${root.source.id}:${entry.name}`,
          name: entry.name,
          scope: root.scope,
          path: skillPath,
          source: root.source,
          digest: "",
          receiptOwned: false,
          enabled: false,
          eligible: false,
          health: "blocked",
          warnings: [`duplicate realpath of ${duplicate}`],
          pinned: false,
          drifted: false,
          shadowedBy: duplicate,
          updatedAt: timestamp,
        });
        continue;
      }
      realpaths.set(canonical, `${root.source.id}:${entry.name}`);
      let manifest: AgentSkillManifestV1 | undefined;
      let digest = "";
      let health: InstalledSkillRecord["health"] = "healthy";
      const warnings: string[] = [];
      try {
        const manifestPath = path.join(canonical, "SKILL.md");
        const stat = await lstat(manifestPath);
        if (!stat.isFile() || stat.size > (options.maxManifestBytes ?? DEFAULT_MAX_MANIFEST_BYTES)) {
          throw new SkillPackageFailure("invalid_manifest", "SKILL.md is missing, not regular, or too large");
        }
        manifest = parseAgentSkillDocument(await readFile(manifestPath, "utf8")).manifest;
        digest = (
          await fingerprintSkillDirectory(canonical, {
            maxDepth: options.maxDepth,
            maxEntries: options.maxEntries,
            maxBundleBytes: options.maxBundleBytes,
          })
        ).digest;
      } catch (error) {
        health = "blocked";
        warnings.push(error instanceof Error ? error.message : String(error));
      }
      installed.push({
        id: `${root.source.id}:${manifest?.name ?? entry.name}`,
        name: manifest?.name ?? entry.name,
        scope: root.scope,
        path: skillPath,
        source: root.source,
        manifest,
        digest,
        receiptOwned: false,
        enabled: health === "healthy",
        eligible: health === "healthy",
        health,
        warnings,
        pinned: false,
        drifted: false,
        updatedAt: timestamp,
      });
    }
  }

  const precedence: Record<SkillScope, number> = { project: 0, user: 1, runtime: 2 };
  const collisions: SkillCollision[] = [];
  const byName = new Map<string, InstalledSkillRecord[]>();
  for (const record of installed) {
    const key = record.name.toLocaleLowerCase("en-US");
    byName.set(key, [...(byName.get(key) ?? []), record]);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => precedence[a.scope] - precedence[b.scope] || a.id.localeCompare(b.id));
    const [winner, ...shadowed] = group;
    for (const record of shadowed) {
      record.shadowedBy = winner.id;
      record.eligible = false;
    }
    collisions.push({
      name: winner.name,
      winnerId: winner.id,
      shadowedIds: shadowed.map((item) => item.id),
      reason: new Set(group.map((item) => item.name)).size > 1 ? "case_insensitive_name" : "scope_precedence",
    });
  }
  return { installed, collisions };
}
