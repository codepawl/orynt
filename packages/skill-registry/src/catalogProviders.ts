import type {
  AgentSkillManifestV1,
  SkillCatalogItem,
  SkillRelease,
  SkillSourceDescriptor,
} from "@codepawl/shared";

import { parseAgentSkillDocument, SkillPackageFailure } from "./packageScanner";

export type CatalogTransportRequest = {
  url: string;
  etag?: string;
  lastModified?: string;
  maxBytes: number;
  timeoutMs: number;
};

export type CatalogTransportResponse = {
  status: number;
  body: string;
  etag?: string;
  lastModified?: string;
  finalUrl: string;
};

export interface SkillCatalogTransport {
  fetch(request: CatalogTransportRequest): Promise<CatalogTransportResponse>;
}

export type SkillCatalogRefreshResult = {
  items: SkillCatalogItem[];
  source: SkillSourceDescriptor;
  notModified: boolean;
  warnings: string[];
};

export interface SkillCatalogProvider {
  readonly source: SkillSourceDescriptor;
  refresh(transport: SkillCatalogTransport): Promise<SkillCatalogRefreshResult>;
}

export function validateRemoteCatalogUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new SkillPackageFailure("unsafe_path", "catalog URLs must use HTTPS");
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) throw new SkillPackageFailure("unsafe_path", "catalog URL resolves to a disallowed host");
  return url;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function manifestFrom(value: unknown, fallbackName: string, fallbackDescription: string): AgentSkillManifestV1 {
  if (typeof value === "string") return parseAgentSkillDocument(value).manifest;
  const input = object(value ?? {}, "manifest");
  const name = typeof input.name === "string" ? input.name : fallbackName;
  const description = typeof input.description === "string" ? input.description : fallbackDescription;
  return {
    schemaVersion: 1,
    name,
    description,
    license: typeof input.license === "string" ? input.license : undefined,
    compatibility: typeof input.compatibility === "string" ? input.compatibility : undefined,
    metadata: object(input.metadata ?? {}, "manifest.metadata"),
    allowedTools: strings(input.allowedTools ?? input["allowed-tools"]),
    rawFrontmatter: input,
  };
}

function releaseFrom(
  sourceId: string,
  publisher: string,
  name: string,
  description: string,
  inputValue: unknown,
): SkillRelease {
  const input = object(inputValue, "release");
  const version = typeof input.version === "string" ? input.version : "0.0.0";
  const revision = string(input.revision ?? input.sha ?? version, "release.revision");
  const manifest = manifestFrom(input.manifest, name, description);
  const fileValues = Array.isArray(input.files) ? input.files : [];
  return {
    id: `${sourceId}:${publisher}/${name}@${version}`,
    version,
    revision,
    digest: typeof input.digest === "string" ? input.digest : undefined,
    changelog: typeof input.changelog === "string" ? input.changelog : undefined,
    releasedAt: typeof input.releasedAt === "string" ? input.releasedAt : undefined,
    manifest,
    files: fileValues.map((value) => {
      if (typeof value === "string") return { path: value };
      const file = object(value, "release.file");
      return {
        path: string(file.path, "release.file.path"),
        sha256: typeof file.sha256 === "string" ? file.sha256 : undefined,
        size: typeof file.size === "number" ? file.size : undefined,
        url: typeof file.url === "string" ? file.url : undefined,
      };
    }),
    capabilities: strings(input.capabilities ?? manifest.allowedTools),
    dependencies: strings(input.dependencies),
  };
}

export function parsePortableSkillCatalog(
  source: SkillSourceDescriptor,
  payload: string,
): SkillCatalogItem[] {
  const root = object(JSON.parse(payload), "catalog");
  const publisher = typeof root.publisher === "string" ? root.publisher : source.id;
  const skills = Array.isArray(root.skills) ? root.skills : [];
  return skills.map((value) => {
    const input = object(value, "skill");
    const name = string(input.name, "skill.name");
    const description = string(input.description ?? name, "skill.description");
    const itemPublisher = typeof input.publisher === "string" ? input.publisher : publisher;
    const releases = Array.isArray(input.releases)
      ? input.releases.map((release) => releaseFrom(source.id, itemPublisher, name, description, release))
      : [releaseFrom(source.id, itemPublisher, name, description, input)];
    return {
      id: `${source.id}:${itemPublisher}/${name}`,
      sourceId: source.id,
      publisher: itemPublisher,
      name,
      description,
      tags: strings(input.tags).sort(),
      license: typeof input.license === "string" ? input.license : releases[0]?.manifest.license,
      homepage: typeof input.homepage === "string" ? input.homepage : undefined,
      releases: releases.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true })),
      trustTier: source.trustTier,
      supported: input.supported !== false,
      unsupportedReason: typeof input.unsupportedReason === "string" ? input.unsupportedReason : undefined,
    };
  });
}

export type ClaudeMarketplaceParseOptions = {
  source: SkillSourceDescriptor;
  publisher?: string;
};

export function parseClaudeMarketplace(payload: string, options: ClaudeMarketplaceParseOptions): SkillCatalogItem[] {
  const root = object(JSON.parse(payload), "marketplace");
  const plugins = Array.isArray(root.plugins) ? root.plugins : [];
  const publisher = options.publisher ?? (typeof root.name === "string" ? root.name : options.source.id);
  return plugins.map((value) => {
    const plugin = object(value, "plugin");
    const name = string(plugin.name, "plugin.name");
    const description = typeof plugin.description === "string" ? plugin.description : name;
    const components = ["hooks", "mcpServers", "lspServers", "agents", "commands"].filter((key) => plugin[key] !== undefined);
    const hasPackageSource =
      typeof plugin.source === "object" &&
      plugin.source !== null &&
      ["npm", "pip"].includes(String((plugin.source as Record<string, unknown>).source));
    const skills = strings(plugin.skills);
    const supported = components.length === 0 && !hasPackageSource && skills.length > 0;
    const revision = typeof plugin.version === "string" ? plugin.version : "unversioned";
    const manifest = manifestFrom(plugin.manifest, name, description);
    return {
      id: `${options.source.id}:${publisher}/${name}`,
      sourceId: options.source.id,
      publisher,
      name,
      description,
      tags: strings(plugin.tags),
      license: typeof plugin.license === "string" ? plugin.license : undefined,
      homepage: typeof plugin.homepage === "string" ? plugin.homepage : undefined,
      trustTier: options.source.trustTier,
      supported,
      unsupportedReason: supported ? undefined : "Requires Plugin Manager",
      releases: [
        {
          id: `${options.source.id}:${publisher}/${name}@${revision}`,
          version: revision,
          revision,
          manifest,
          files: skills.map((path) => ({ path })),
          capabilities: manifest.allowedTools,
          dependencies: [],
        },
      ],
    };
  });
}

export type GitHubTreeEntry = { path: string; type: "blob" | "tree"; sha: string; size?: number; url?: string };

export function parseGitHubSkillTree(
  source: SkillSourceDescriptor,
  publisher: string,
  revision: string,
  entries: GitHubTreeEntry[],
): SkillCatalogItem[] {
  const groups = new Map<string, GitHubTreeEntry[]>();
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    const match = entry.path.match(/^(?:skills\/)?([^/]+)\/SKILL\.md$/);
    if (!match || entry.type !== "blob") continue;
    const prefix = entry.path.slice(0, -"SKILL.md".length);
    groups.set(match[1], entries.filter((candidate) => candidate.type === "blob" && candidate.path.startsWith(prefix)));
  }
  return [...groups.entries()].map(([name, files]) => {
    const description = `Agent skill ${name} from ${publisher}`;
    const manifest = manifestFrom({}, name, description);
    return {
      id: `${source.id}:${publisher}/${name}`,
      sourceId: source.id,
      publisher,
      name,
      description,
      tags: [],
      trustTier: source.trustTier,
      supported: true,
      releases: [
        {
          id: `${source.id}:${publisher}/${name}@${revision}`,
          version: revision.slice(0, 12),
          revision,
          manifest,
          files: files.map((file) => ({ path: file.path, sha256: file.sha, size: file.size, url: file.url })),
          capabilities: [],
          dependencies: [],
        },
      ],
    };
  });
}

export class JsonCatalogProvider implements SkillCatalogProvider {
  constructor(
    readonly source: SkillSourceDescriptor,
    private readonly parser: (source: SkillSourceDescriptor, payload: string) => SkillCatalogItem[] = parsePortableSkillCatalog,
    private readonly limits = { maxBytes: 2 * 1024 * 1024, timeoutMs: 10_000 },
  ) {}

  async refresh(transport: SkillCatalogTransport): Promise<SkillCatalogRefreshResult> {
    validateRemoteCatalogUrl(this.source.uri);
    const response = await transport.fetch({
      url: this.source.uri,
      etag: this.source.etag,
      lastModified: this.source.lastModified,
      ...this.limits,
    });
    validateRemoteCatalogUrl(response.finalUrl);
    if (response.status === 304) return { items: [], source: this.source, notModified: true, warnings: [] };
    if (response.status < 200 || response.status >= 300) throw new Error(`catalog request failed with HTTP ${response.status}`);
    if (Buffer.byteLength(response.body, "utf8") > this.limits.maxBytes) throw new Error("catalog response exceeded size limit");
    const refreshedAt = new Date().toISOString();
    return {
      items: this.parser(this.source, response.body),
      source: { ...this.source, refreshedAt, etag: response.etag, lastModified: response.lastModified },
      notModified: false,
      warnings: [],
    };
  }
}

export class StaticCatalogProvider implements SkillCatalogProvider {
  constructor(
    readonly source: SkillSourceDescriptor,
    private readonly items: SkillCatalogItem[],
  ) {}

  async refresh(_transport: SkillCatalogTransport): Promise<SkillCatalogRefreshResult> {
    return { items: structuredClone(this.items), source: this.source, notModified: false, warnings: [] };
  }
}

export function searchSkillCatalog(items: SkillCatalogItem[], query: string, sourcePriority: string[] = []): SkillCatalogItem[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const priority = new Map(sourcePriority.map((id, index) => [id, index]));
  const score = (item: SkillCatalogItem) => {
    const name = item.name.toLowerCase();
    const haystack = `${name} ${item.description} ${item.tags.join(" ")}`.toLowerCase();
    return terms.reduce((total, term) => total + (name === term ? 100 : name.includes(term) ? 20 : item.tags.includes(term) ? 10 : haystack.includes(term) ? 1 : 0), 0);
  };
  return items
    .filter((item) => terms.length === 0 || score(item) > 0)
    .sort(
      (a, b) =>
        score(b) - score(a) ||
        (priority.get(a.sourceId) ?? Number.MAX_SAFE_INTEGER) - (priority.get(b.sourceId) ?? Number.MAX_SAFE_INTEGER) ||
        a.id.localeCompare(b.id),
    );
}
