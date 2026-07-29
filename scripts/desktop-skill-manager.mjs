#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LocalSkillPackageManager,
  searchSkillCatalog,
} from "../packages/skill-registry/dist/index.js";

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_CATALOG_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_RELEASE_FILES = 200;
const MAX_RELEASE_BYTES = 8 * 1024 * 1024;
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_SKILL_ROOT = path.resolve(
  SCRIPT_DIRECTORY,
  "..",
  "packages",
  "skill-registry",
  "builtins",
);
const BUILTIN_SOURCE = {
  id: "orynt-builtin",
  label: "Orynt built-ins",
  kind: "runtime",
  uri: "orynt://builtins",
  trustTier: "builtin",
  enabled: true,
  readOnly: true,
  message: "Shipped with this Orynt build. Attach explicitly per run.",
};

const SOURCES = [
  BUILTIN_SOURCE,
  {
    id: "openai-plugins",
    label: "OpenAI plugins",
    kind: "github",
    uri: "https://github.com/openai/plugins",
    owner: "openai",
    repo: "plugins",
    branch: "main",
    trustTier: "trusted",
    enabled: true,
  },
  {
    id: "hermes-official",
    label: "Hermes official",
    kind: "github",
    uri: "https://github.com/NousResearch/hermes-agent/tree/main/optional-skills",
    owner: "NousResearch",
    repo: "hermes-agent",
    branch: "main",
    pathPrefix: "optional-skills/",
    trustTier: "trusted",
    enabled: true,
  },
  {
    id: "anthropic-official",
    label: "Anthropic skill-only plugins",
    kind: "marketplace",
    uri: "https://github.com/anthropics/claude-plugins-official",
    owner: "anthropics",
    repo: "claude-plugins-official",
    branch: "main",
    trustTier: "trusted",
    enabled: true,
  },
  {
    id: "skills-sh",
    label: "skills.sh",
    kind: "community",
    uri: "https://skills.sh",
    trustTier: "community",
    enabled: false,
    message: "Add a supported HTTPS catalog endpoint to enable refresh.",
  },
  {
    id: "clawhub",
    label: "ClawHub",
    kind: "community",
    uri: "https://clawhub.ai",
    trustTier: "untrusted",
    enabled: false,
    message: "Public discovery is opt-in; community skills require explicit review.",
  },
];

async function readJsonStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) throw new Error("stdin JSON input is required");
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("stdin must contain a JSON object");
  }
  return value;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function trust(value) {
  return value === "builtin" || value === "trusted"
    ? "trusted"
    : value === "community"
      ? "community"
      : "untrusted";
}

function sourceDescriptor(source) {
  return {
    id: source.id,
    kind: source.kind === "community" ? "marketplace" : source.kind,
    label: source.label,
    uri: source.uri,
    trustTier: source.trustTier,
    enabled: source.enabled,
    readOnly: true,
    ...(source.refreshedAt ? { refreshedAt: source.refreshedAt } : {}),
  };
}

function uiSource(source, cached) {
  const isBuiltin = source.trustTier === "builtin";
  return {
    id: source.id,
    label: source.label,
    kind: source.kind,
    uri: source.uri,
    trust: trust(source.trustTier),
    enabled: source.enabled,
    stale: isBuiltin ? false : !cached?.refreshedAt,
    lastRefreshedAt: cached?.refreshedAt ?? null,
    message: cached?.message ?? source.message ?? null,
  };
}

function uiInstalled(record) {
  return {
    id: record.id,
    name: record.name,
    description: record.manifest?.description ?? record.warnings[0] ?? "Agent Skill",
    version:
      record.version ??
      record.revision ??
      (record.source.trustTier === "builtin" ? "bundled" : "local"),
    scope: record.scope,
    sourceId: record.source.id,
    sourceLabel: record.source.label,
    digest: record.digest ? `sha256:${record.digest}` : "",
    enabled: record.enabled,
    eligible: record.eligible,
    managed: record.receiptOwned,
    pinned: record.pinned,
    drifted: record.drifted,
    health: record.health === "healthy" ? "ready" : record.health,
    trust: trust(record.source.trustTier),
    updateVersion: null,
    updateRequiresReview: false,
    path: record.path,
    manifest: record.manifest ? JSON.stringify(record.manifest) : undefined,
  };
}

function uiInventory(snapshot) {
  return {
    scannedAt: snapshot.generatedAt,
    skills: snapshot.installed.map(uiInstalled),
    collisions: snapshot.collisions.map((collision) => ({
      name: collision.name,
      skillIds: [collision.winnerId, ...collision.shadowedIds],
      message: collision.reason.replaceAll("_", " "),
    })),
    warnings: snapshot.installed.flatMap((skill) =>
      skill.warnings.map((warning) => `${skill.name}: ${warning}`),
    ),
  };
}

function uiCatalogItem(item, installed = []) {
  const release = item.releases[0];
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    publisher: item.publisher,
    version: release?.version ?? "unversioned",
    sourceId: item.sourceId,
    sourceLabel: SOURCES.find((source) => source.id === item.sourceId)?.label ?? item.sourceId,
    trust: trust(item.trustTier),
    license: item.license ?? release?.manifest.license ?? null,
    compatibility: release?.manifest.compatibility ?? null,
    installedSkillId:
      installed.find((skill) => skill.name.toLowerCase() === item.name.toLowerCase())?.id ?? null,
    capabilities: release?.capabilities ?? [],
  };
}

function uiPlan(plan, name = plan.skillId) {
  const changeKind = plan.kind === "remove" || plan.kind === "purge" ? "remove" : "install" === plan.kind ? "add" : "change";
  return {
    id: plan.id,
    kind: plan.kind,
    skillId: plan.skillId,
    skillName: name,
    scope: plan.scope,
    summary: `${plan.kind[0].toUpperCase()}${plan.kind.slice(1)} ${name} in ${plan.scope} scope.`,
    trust: trust(plan.trustDecision),
    expiresAt: plan.expiresAt,
    approved: Boolean(plan.approvedAt),
    changes: [
      {
        kind: changeKind,
        label: name,
        detail: `${plan.kind} is staged for ${plan.destinationPath}`,
      },
    ],
    warnings:
      plan.trustDecision === "builtin" || plan.trustDecision === "trusted"
        ? []
        : ["Third-party instructions are untrusted until reviewed by the operator."],
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "orynt-skill-manager/0.1",
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_CATALOG_BYTES) throw new Error("catalog response exceeds size limit");
    const body = await response.text();
    if (Buffer.byteLength(body) > MAX_CATALOG_BYTES) throw new Error("catalog response exceeds size limit");
    return JSON.parse(body);
  } finally {
    clearTimeout(timeout);
  }
}

function skillItemsFromGitHubTree(source, tree, revision) {
  const blobs = tree.filter((entry) => entry.type === "blob");
  const manifests = blobs.filter(
    (entry) =>
      entry.path.endsWith("/SKILL.md") &&
      (!source.pathPrefix || entry.path.startsWith(source.pathPrefix)),
  );
  return manifests.map((manifestEntry) => {
    const root = manifestEntry.path.slice(0, -"/SKILL.md".length);
    const name = root.split("/").at(-1);
    const bundleFiles = blobs
      .filter((entry) => entry.path === `${root}/SKILL.md` || entry.path.startsWith(`${root}/`))
      .map((entry) => ({
        path: entry.path.slice(root.length + 1),
        url: `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${revision}/${entry.path}`,
        size: entry.size,
      }));
    return {
      id: `${source.id}:${source.owner}/${name}`,
      sourceId: source.id,
      publisher: source.owner,
      name,
      description: `Agent Skill ${name} from ${source.label}`,
      tags: [],
      homepage: `${source.uri}/${root}`,
      releases: [
        {
          id: `${source.id}:${source.owner}/${name}@${revision}`,
          version: revision.slice(0, 12),
          revision,
          manifest: {
            schemaVersion: 1,
            name,
            description: `Agent Skill ${name} from ${source.label}`,
            metadata: {},
            allowedTools: [],
            rawFrontmatter: {},
          },
          files: bundleFiles,
          capabilities: [],
          dependencies: [],
        },
      ],
      trustTier: source.trustTier,
      supported: true,
    };
  });
}

async function loadCache(cachePath) {
  try {
    return JSON.parse(await readFile(cachePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { schemaVersion: 1, sources: {}, items: [] };
    throw error;
  }
}

async function saveCache(cachePath, cache) {
  await mkdir(path.dirname(cachePath), { recursive: true, mode: 0o700 });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function refreshCatalog(cachePath) {
  const cache = await loadCache(cachePath);
  const nextItems = cache.items.filter(
    (item) => !SOURCES.some((source) => source.enabled && source.id === item.sourceId),
  );
  for (const source of SOURCES.filter((candidate) => candidate.enabled && candidate.owner)) {
    try {
      const payload = await fetchJson(
        `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${source.branch}?recursive=1`,
      );
      nextItems.push(
        ...skillItemsFromGitHubTree(
          source,
          payload.tree ?? [],
          typeof payload.sha === "string" ? payload.sha : source.branch,
        ),
      );
      cache.sources[source.id] = {
        refreshedAt: new Date().toISOString(),
        message: null,
      };
    } catch (error) {
      cache.sources[source.id] = {
        ...(cache.sources[source.id] ?? {}),
        message: `Refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  cache.items = nextItems;
  await saveCache(cachePath, cache);
  return cache;
}

async function downloadBundle(item, destination) {
  const release = item.releases?.[0];
  if (!release?.files?.length) throw new Error("selected release has no downloadable files");
  if (release.files.length > MAX_RELEASE_FILES) {
    throw new Error("selected release exceeds the file-count limit");
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true, mode: 0o700 });
  let totalBytes = 0;
  for (const file of release.files) {
    if (
      !file.url ||
      !/^[a-zA-Z0-9._/-]+$/.test(file.path) ||
      path.isAbsolute(file.path) ||
      file.path.split("/").includes("..") ||
      file.path.split("/").length > 12
    ) {
      throw new Error(`unsafe or unavailable release file: ${file.path}`);
    }
    const fileUrl = new URL(file.url);
    if (
      fileUrl.protocol !== "https:" ||
      fileUrl.hostname !== "raw.githubusercontent.com"
    ) {
      throw new Error(`release file host is not allowed: ${file.path}`);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(file.url, {
        redirect: "error",
        signal: controller.signal,
        headers: { "User-Agent": "orynt-skill-manager/0.1" },
      });
      if (!response.ok) throw new Error(`download failed with HTTP ${response.status}`);
      const declaredSize = Number(response.headers.get("content-length") ?? 0);
      if (declaredSize > 512 * 1024) throw new Error(`release file is too large: ${file.path}`);
      const chunks = [];
      let fileBytes = 0;
      if (!response.body) throw new Error(`release file body is unavailable: ${file.path}`);
      for await (const chunk of response.body) {
        const bytes = Buffer.from(chunk);
        fileBytes += bytes.length;
        totalBytes += bytes.length;
        if (fileBytes > 512 * 1024 || totalBytes > MAX_RELEASE_BYTES) {
          controller.abort();
          throw new Error("selected release exceeds its download byte limit");
        }
        chunks.push(bytes);
      }
      const bytes = Buffer.concat(chunks);
      const target = path.resolve(destination, file.path);
      if (!target.startsWith(`${path.resolve(destination)}${path.sep}`)) throw new Error("release file escapes staging");
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, bytes, { mode: 0o600 });
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function dispatch(request) {
  const input = object(request.input);
  const repositoryPath =
    typeof input.repositoryPath === "string" && input.repositoryPath
      ? path.resolve(input.repositoryPath)
      : process.cwd();
  const managerRoot = path.resolve(request.managerRoot);
  const manager = new LocalSkillPackageManager({
    repositoryPath,
    userSkillRoot: request.userSkillRoot,
    stateRoot: managerRoot,
    runtimeRoots: [
      {
        path: BUILTIN_SKILL_ROOT,
        scope: "runtime",
        source: {
          id: BUILTIN_SOURCE.id,
          kind: BUILTIN_SOURCE.kind,
          label: BUILTIN_SOURCE.label,
          uri: BUILTIN_SOURCE.uri,
          trustTier: BUILTIN_SOURCE.trustTier,
          enabled: BUILTIN_SOURCE.enabled,
          readOnly: true,
        },
      },
    ],
  });
  const cachePath = path.join(managerRoot, "catalog-cache.json");
  const operation = request.operation;

  if (operation === "inventory.scan" || operation === "inventory.list") {
    return uiInventory(await manager.scan());
  }
  if (operation === "inventory.get") {
    const snapshot = await manager.scan();
    const skill = snapshot.installed.find((candidate) => candidate.id === input.skillId);
    if (!skill) throw new Error(`installed skill not found: ${input.skillId}`);
    return uiInstalled(skill);
  }
  if (operation === "hub.listSources") {
    const cache = await loadCache(cachePath);
    return SOURCES.map((source) => uiSource(source, cache.sources[source.id]));
  }
  if (operation === "hub.refresh") {
    const cache = await refreshCatalog(cachePath);
    return SOURCES.map((source) => uiSource(source, cache.sources[source.id]));
  }
  if (operation === "hub.search" || operation === "hub.get") {
    const cache = await loadCache(cachePath);
    const snapshot = await manager.scan();
    if (operation === "hub.get") {
      const item = cache.items.find((candidate) => candidate.id === input.skillId);
      if (!item) throw new Error(`catalog skill not found: ${input.skillId}`);
      return uiCatalogItem(item, snapshot.installed);
    }
    const sourceIds = new Set(Array.isArray(input.sourceIds) ? input.sourceIds : []);
    const items = cache.items.filter(
      (item) => sourceIds.size === 0 || sourceIds.has(item.sourceId),
    );
    return searchSkillCatalog(items, typeof input.query === "string" ? input.query : "").map(
      (item) => uiCatalogItem(item, snapshot.installed),
    );
  }
  if (operation === "mutation.plan") {
    const kind = input.kind;
    const scope = input.scope === "project" ? "project" : "user";
    let sourcePath;
    let source;
    let name = input.catalogItem?.name;
    if (kind === "import") {
      if (typeof input.sourcePath !== "string" || !input.sourcePath.trim()) {
        throw new Error("import requires an explicit local source path");
      }
      sourcePath = path.resolve(input.sourcePath);
      name = path.basename(sourcePath);
      source = {
        id: "local-import",
        kind: "local",
        label: "Local import",
        uri: sourcePath,
        trustTier: "untrusted",
        enabled: true,
        readOnly: false,
      };
    } else if (kind === "install" || kind === "update") {
      const cache = await loadCache(cachePath);
      const item = cache.items.find((candidate) => candidate.id === input.skillId);
      if (!item) throw new Error(`catalog skill not found: ${input.skillId}`);
      name = item.name;
      const stagingId = createHash("sha256")
        .update(`${item.id}:${item.releases[0]?.revision ?? "latest"}`)
        .digest("hex");
      sourcePath = path.join(managerRoot, "downloads", stagingId);
      await downloadBundle(item, sourcePath);
      const sourceConfig = SOURCES.find((candidate) => candidate.id === item.sourceId);
      source = sourceDescriptor(sourceConfig);
    } else {
      const snapshot = await manager.scan();
      const installed = snapshot.installed.find((candidate) => candidate.id === input.skillId);
      name = installed?.name ?? String(input.skillId).split(":").at(-1);
      source = installed?.source;
    }
    const plan = await manager.planMutation({
      kind,
      skillId: input.skillId,
      scope,
      name,
      source,
      sourcePath,
    });
    return uiPlan(plan, name);
  }
  if (operation === "mutation.approve") {
    if (input.actor !== "operator" || typeof input.reason !== "string" || !input.reason.trim()) {
      throw new Error("explicit operator approval and reason are required");
    }
    return uiPlan(await manager.approveMutation(input.planId));
  }
  if (operation === "mutation.execute") {
    await manager.executeMutation(input.planId);
    return {
      planId: input.planId,
      status: "completed",
      inventory: uiInventory(await manager.scan()),
      message: "Skill mutation completed and inventory was rescanned.",
    };
  }
  if (operation === "mutation.history") {
    const state = await manager.store.load();
    return state.transactions;
  }
  if (operation === "mutation.recover") {
    return manager.store.recoverInterruptedTransactions();
  }
  if (operation === "context.snapshot") {
    const skillIds = Array.isArray(input.skillIds) ? input.skillIds : [];
    const runId =
      typeof input.runId === "string" && input.runId
        ? input.runId
        : `context-${Date.now()}`;
    const context = await manager.createContextSnapshot(runId, skillIds);
    return {
      createdAt: context.createdAt,
      skillIds: context.skills.map((skill) => skill.skillId),
      digest: `sha256:${context.digest}`,
      warnings: [],
      context,
    };
  }
  throw new Error(`unsupported skill manager operation: ${operation}`);
}

async function main() {
  const request = await readJsonStdin();
  const result = await dispatch(request);
  const response = JSON.stringify({ result, events: [] });
  if (Buffer.byteLength(response) > MAX_RESPONSE_BYTES) throw new Error("response exceeds size limit");
  process.stdout.write(`${response}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
