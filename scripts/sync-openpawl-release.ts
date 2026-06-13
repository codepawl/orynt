import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";

type JsonObject = Record<string, unknown>;

type OpenpawlReleasePayload = {
  schemaVersion: 1;
  source: "codepawl/openpawl";
  tag: string;
  releaseUrl: string;
  repoUrl: string;
  publishedAt: string;
  commitSha?: string;
  docs: {
    readme: string;
    install: string;
    marketplace: string;
    config: string;
    security: string;
    privacy: string;
  };
  capabilities: {
    surface: "github-actions";
    actionRef: string;
    mockDefault: boolean;
    supportedActionProviders: ReadonlyArray<string>;
    artifactSchemaVersion: "1";
    evidenceBundle: boolean;
    cloudEvidence: "local-preview";
    writeMode: "explicit-safety-gated";
  };
  releaseNotes?: {
    summary?: string;
  };
};

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const payloadPath = getArgValue("--payload");
const tagPattern = /^v\d+\.\d+\.\d+$/;
const githubOpenpawlOrigin = "https://github.com/codepawl/openpawl";

const managedFiles = [
  "apps/web/src/data/openpawl-release.ts",
  "README.md",
  "docs/OPENPAWL_INSTALL.md",
  "docs/MARKETPLACE.md",
  "docs/PRODUCT.md",
  "docs/ROADMAP.md",
  ".agents/marketplace/OPENPAWL_MARKETPLACE_SUBMISSION.md",
  ".agents/plans/CODEPAWL_CLOUD_EVIDENCE_HUB_PLAN.md",
] as const;

const publicWebsiteRouteFiles = [
  "apps/web/src/routes/openpawl.install.tsx",
  "apps/web/src/routes/openpawl.docs.tsx",
  "apps/web/src/routes/openpawl.support.tsx",
] as const;

const forbiddenPayloadKeys = new Set([
  "artifact",
  "artifacts",
  "artifactContents",
  "bundle",
  "bundleContents",
  "customerData",
  "customerArtifacts",
  "evidenceBundleContents",
  "privateKey",
  "secret",
  "secrets",
  "token",
  "tokens",
  "workflowLog",
  "workflowLogs",
]);

const forbiddenStringPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
] as const;

const payload = validatePayload(readPayload());
const replacements = buildReleaseReplacements(payload);
const changedFiles: string[] = [];

for (const file of managedFiles) {
  const current = readFileSync(file, "utf8");
  const next = buildManagedFile(file, current, payload, replacements);
  validateManagedFile(file, next, payload);

  if (current !== next) {
    changedFiles.push(file);
    if (!checkOnly) {
      writeFileSync(file, next);
    }
  }
}

validatePublicWebsiteRoutes(payload);

const summary = {
  tag: payload.tag,
  actionRef: payload.capabilities.actionRef,
  releaseUrl: payload.releaseUrl,
  cloudEvidence: payload.capabilities.cloudEvidence,
  changedFiles: changedFiles.map((file) => relative(process.cwd(), file)),
  mode: checkOnly ? "check" : "write",
};

console.log(JSON.stringify(summary, null, 2));

if (checkOnly && changedFiles.length > 0) {
  console.error("Openpawl release metadata is not in sync.");
  process.exit(1);
}

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function readPayload(): unknown {
  const raw = payloadPath
    ? readFileSync(payloadPath, "utf8")
    : process.env.OPENPAWL_RELEASE_PAYLOAD;

  if (!raw) {
    throw new Error(
      "Set OPENPAWL_RELEASE_PAYLOAD or pass --payload <path> with a dispatch payload.",
    );
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Openpawl release payload must be valid JSON: ${String(error)}`);
  }
}

function validatePayload(value: unknown): OpenpawlReleasePayload {
  assertObject(value, "payload");
  rejectSensitivePayload(value, "payload");

  const payload = value as JsonObject;
  assertEqual(payload.schemaVersion, 1, "schemaVersion");
  assertEqual(payload.source, "codepawl/openpawl", "source");
  assertString(payload.tag, "tag");
  assertMatches(payload.tag, tagPattern, "tag");
  assertString(payload.releaseUrl, "releaseUrl");
  assertString(payload.repoUrl, "repoUrl");
  assertString(payload.publishedAt, "publishedAt");
  assertOpenpawlUrl(payload.releaseUrl, "releaseUrl");
  assertOpenpawlUrl(payload.repoUrl, "repoUrl");
  assertEqual(payload.releaseUrl, `${githubOpenpawlOrigin}/releases/tag/${payload.tag}`, "releaseUrl");
  assertEqual(payload.repoUrl, githubOpenpawlOrigin, "repoUrl");
  assertIsoDate(payload.publishedAt, "publishedAt");

  if (payload.commitSha !== undefined) {
    assertString(payload.commitSha, "commitSha");
    assertMatches(payload.commitSha, /^[a-f0-9]{7,40}$/i, "commitSha");
  }

  assertObject(payload.docs, "docs");
  const docs = payload.docs as JsonObject;
  for (const key of ["readme", "install", "marketplace", "config", "security", "privacy"]) {
    assertString(docs[key], `docs.${key}`);
    assertOpenpawlUrl(docs[key], `docs.${key}`);
  }

  assertEqual(docs.readme, `${githubOpenpawlOrigin}/blob/${payload.tag}/README.md`, "docs.readme");
  assertEqual(
    docs.install,
    `${githubOpenpawlOrigin}/blob/${payload.tag}/docs/OPENPAWL_INSTALL.md`,
    "docs.install",
  );
  assertEqual(
    docs.marketplace,
    `${githubOpenpawlOrigin}/blob/${payload.tag}/docs/MARKETPLACE.md`,
    "docs.marketplace",
  );
  assertEqual(
    docs.config,
    `${githubOpenpawlOrigin}/blob/${payload.tag}/docs/OPENPAWL_CONFIG.md`,
    "docs.config",
  );
  assertEqual(docs.security, `${githubOpenpawlOrigin}/blob/${payload.tag}/SECURITY.md`, "docs.security");
  assertEqual(docs.privacy, `${githubOpenpawlOrigin}/blob/${payload.tag}/PRIVACY.md`, "docs.privacy");

  assertObject(payload.capabilities, "capabilities");
  const capabilities = payload.capabilities as JsonObject;
  assertEqual(capabilities.surface, "github-actions", "capabilities.surface");
  assertEqual(
    capabilities.actionRef,
    `codepawl/openpawl@${payload.tag}`,
    "capabilities.actionRef",
  );
  assertEqual(capabilities.mockDefault, true, "capabilities.mockDefault");
  assertStringArray(capabilities.supportedActionProviders, "capabilities.supportedActionProviders");
  assertEqual(capabilities.artifactSchemaVersion, "1", "capabilities.artifactSchemaVersion");
  assertEqual(capabilities.evidenceBundle, true, "capabilities.evidenceBundle");
  assertEqual(capabilities.cloudEvidence, "local-preview", "capabilities.cloudEvidence");
  assertEqual(
    capabilities.writeMode,
    "explicit-safety-gated",
    "capabilities.writeMode",
  );

  if (payload.releaseNotes !== undefined) {
    assertObject(payload.releaseNotes, "releaseNotes");
    const releaseNotes = payload.releaseNotes as JsonObject;
    if (releaseNotes.summary !== undefined) {
      assertString(releaseNotes.summary, "releaseNotes.summary");
    }
  }

  return value as OpenpawlReleasePayload;
}

function rejectSensitivePayload(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitivePayload(item, `${path}[${index}]`));
    return;
  }

  if (typeof value === "string") {
    for (const pattern of forbiddenStringPatterns) {
      if (pattern.test(value)) {
        throw new Error(`${path} appears to contain a secret-like value.`);
      }
    }
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value as JsonObject)) {
    if (forbiddenPayloadKeys.has(key)) {
      throw new Error(`Payload must not include ${path}.${key}.`);
    }
    rejectSensitivePayload(child, `${path}.${key}`);
  }
}

function buildReleaseReplacements(payload: OpenpawlReleasePayload) {
  return {
    tag: payload.tag,
    actionRef: payload.capabilities.actionRef,
    releaseUrl: payload.releaseUrl,
    docs: payload.docs,
    actionMetadata: `${githubOpenpawlOrigin}/blob/${payload.tag}/action.yml`,
    docsTree: `${githubOpenpawlOrigin}/tree/${payload.tag}/docs`,
  };
}

type ReleaseReplacements = ReturnType<typeof buildReleaseReplacements>;

function buildManagedFile(
  file: string,
  current: string,
  payload: OpenpawlReleasePayload,
  replacements: ReleaseReplacements,
): string {
  if (file.endsWith("openpawl-release.ts")) {
    return buildManifest(payload);
  }
  if (file === ".agents/marketplace/OPENPAWL_MARKETPLACE_SUBMISSION.md") {
    return syncMarketplaceSubmission(current, replacements);
  }
  if (file === ".agents/plans/CODEPAWL_CLOUD_EVIDENCE_HUB_PLAN.md") {
    return syncCloudEvidencePlan(current, replacements);
  }
  return applyReleaseRefs(current, replacements);
}

function applyReleaseRefs(text: string, replacements: ReleaseReplacements): string {
  return text
    .replace(/codepawl\/openpawl@v\d+\.\d+\.\d+/g, replacements.actionRef)
    .replace(
      /https:\/\/github\.com\/codepawl\/openpawl\/releases\/tag\/v\d+\.\d+\.\d+/g,
      replacements.releaseUrl,
    )
    .replace(
      /https:\/\/github\.com\/codepawl\/openpawl\/blob\/v\d+\.\d+\.\d+\/README\.md/g,
      replacements.docs.readme,
    )
    .replace(
      /https:\/\/github\.com\/codepawl\/openpawl\/blob\/v\d+\.\d+\.\d+\/docs\/OPENPAWL_INSTALL\.md/g,
      replacements.docs.install,
    )
    .replace(
      /https:\/\/github\.com\/codepawl\/openpawl\/blob\/v\d+\.\d+\.\d+\/docs\/MARKETPLACE\.md/g,
      replacements.docs.marketplace,
    )
    .replace(
      /https:\/\/github\.com\/codepawl\/openpawl\/blob\/v\d+\.\d+\.\d+\/docs\/OPENPAWL_CONFIG\.md/g,
      replacements.docs.config,
    )
    .replace(
      /https:\/\/github\.com\/codepawl\/openpawl\/blob\/v\d+\.\d+\.\d+\/SECURITY\.md/g,
      replacements.docs.security,
    )
    .replace(
      /https:\/\/github\.com\/codepawl\/openpawl\/blob\/v\d+\.\d+\.\d+\/PRIVACY\.md/g,
      replacements.docs.privacy,
    )
    .replace(
      /https:\/\/github\.com\/codepawl\/openpawl\/blob\/v\d+\.\d+\.\d+\/action\.yml/g,
      replacements.actionMetadata,
    )
    .replace(
      /https:\/\/github\.com\/codepawl\/openpawl\/tree\/v\d+\.\d+\.\d+\/docs/g,
      replacements.docsTree,
    )
    .replace(/candidate release is `v\d+\.\d+\.\d+`/gi, `candidate release is \`${replacements.tag}\``)
    .replace(/public release is `v\d+\.\d+\.\d+`/gi, `public release is \`${replacements.tag}\``)
    .replace(/release `v\d+\.\d+\.\d+`/g, `release \`${replacements.tag}\``)
    .replace(/Release `v\d+\.\d+\.\d+`/g, `Release \`${replacements.tag}\``)
    .replace(/Release: `v\d+\.\d+\.\d+`/g, `Release: \`${replacements.tag}\``)
    .replace(/`v\d+\.\d+\.\d+` is the verified public Action release tag/g, `\`${replacements.tag}\` is the verified public Action release tag`)
    .replace(/Use `v\d+\.\d+\.\d+` for release-pinned/g, `Use \`${replacements.tag}\` for release-pinned`)
    .replace(/pinned public release is `v\d+\.\d+\.\d+`/gi, `pinned public release is \`${replacements.tag}\``);
}

function syncMarketplaceSubmission(text: string, replacements: ReleaseReplacements): string {
  return applyReleaseRefs(text, replacements)
    .replace(
      /\| Candidate release \| `v\d+\.\d+\.\d+` \|/,
      `| Candidate release | \`${replacements.tag}\` |`,
    )
    .replace(
      /The pinned public release is `v\d+\.\d+\.\d+`\. It is an Action patch release that adds\n`openpawl-evidence-bundle\.json` while preserving the self-managed GitHub\nActions surface and existing safety gates\./,
      `The pinned public release is \`${replacements.tag}\`. It is an Action/Marketplace-only release that stabilizes shared Action contracts, provider config, evidence artifact schema v1, and full artifact smoke validation while preserving the self-managed GitHub Actions surface, local/browser-only Evidence preview, and existing safety gates.`,
    )
    .replace(
      /Keep Marketplace release references pinned to `v\d+\.\d+\.\d+` unless a new Action release process is explicitly started\./,
      `Keep Marketplace release references pinned to \`${replacements.tag}\` for this Action/Marketplace-only release. Do not imply a TUI/npm release.`,
    );
}

function syncCloudEvidencePlan(text: string, replacements: ReleaseReplacements): string {
  const next = text
    .replace(
      /Preview Openpawl run bundles produced by `codepawl\/openpawl@v\d+\.\d+\.\d+\+` locally/,
      `Preview Openpawl run bundles produced by \`${replacements.actionRef}+\` locally`,
    )
    .replace(
      /verified Openpawl `v0\.5\.3` Action release:\n`https:\/\/github\.com\/codepawl\/openpawl\/releases\/tag\/v\d+\.\d+\.\d+`/,
      "verified Openpawl `v0.5.3` Action release:\n`https://github.com/codepawl/openpawl/releases/tag/v0.5.3`",
    )
    .replace(
      /Verified Openpawl `v0\.5\.3` exists at\n     `https:\/\/github\.com\/codepawl\/openpawl\/releases\/tag\/v\d+\.\d+\.\d+`/,
      "Verified Openpawl `v0.5.3` exists at\n     `https://github.com/codepawl/openpawl/releases/tag/v0.5.3`",
    );

  if (next.includes(`**${replacements.tag} Action-only release sync**`)) {
    return next;
  }

  return next.replace(
    /(\n3d\. \*\*CP-006 v0\.5\.3 evidence bundle release sync\*\*[\s\S]*?or Cloud general-availability claim was introduced\.\n)/,
    `$1
3e. **${replacements.tag} Action-only release sync**
   - Synced current website, install, docs, and Marketplace references to
     \`${replacements.actionRef}\`.
   - Preserved CP-006 \`v0.5.3\` evidence-bundle verification notes as
     historical release records.
   - Kept \`/cloud/evidence\` local/browser-only. No server upload, customer
     artifact storage, Marketplace webhook behavior change, TUI/npm release
     claim, or Cloud general-availability claim was introduced.
`,
  );
}

function validateManagedFile(file: string, text: string, payload: OpenpawlReleasePayload): void {
  if (file === ".agents/marketplace/OPENPAWL_MARKETPLACE_SUBMISSION.md") {
    assertTextIncludes(text, `| Candidate release | \`${payload.tag}\` |`, file);
    assertTextIncludes(text, `| Release URL | \`${payload.releaseUrl}\` |`, file);
    assertTextIncludes(text, `The current public release is \`${payload.capabilities.actionRef}\``, file);
    assertTextIncludes(text, `The pinned public release is \`${payload.tag}\`. It is an Action/Marketplace-only release`, file);
    assertTextIncludes(text, `Action metadata: \`${githubOpenpawlOrigin}/blob/${payload.tag}/action.yml\``, file);
    assertTextIncludes(text, `Docs tree: \`${githubOpenpawlOrigin}/tree/${payload.tag}/docs\``, file);
    assertReleaseLockedUrlsUsePayloadTag(file, text, payload.tag);
  } else if (file === ".agents/plans/CODEPAWL_CLOUD_EVIDENCE_HUB_PLAN.md") {
    assertTextIncludes(text, "verified Openpawl `v0.5.3` Action release:\n`https://github.com/codepawl/openpawl/releases/tag/v0.5.3`", file);
    assertTextIncludes(text, "Verified Openpawl `v0.5.3` exists at\n     `https://github.com/codepawl/openpawl/releases/tag/v0.5.3`", file);
    assertTextIncludes(text, `**${payload.tag} Action-only release sync**`, file);
    assertTextIncludes(text, payload.capabilities.actionRef, file);
  } else if (!file.endsWith("openpawl-release.ts")) {
    assertReleaseLockedUrlsUsePayloadTag(file, text, payload.tag);
  }
}

function validatePublicWebsiteRoutes(payload: OpenpawlReleasePayload): void {
  for (const file of publicWebsiteRouteFiles) {
    const text = readFileSync(file, "utf8");
    assertActionRefsUsePayloadTag(file, text, payload.tag);
    assertReleaseLockedUrlsUsePayloadTag(file, text, payload.tag);
    assertNoStaleSemver(file, text, payload.tag);
  }

  const installRoute = readFileSync("apps/web/src/routes/openpawl.install.tsx", "utf8");
  assertTextIncludes(installRoute, "OPENPAWL_ACTION_REF", "apps/web/src/routes/openpawl.install.tsx");
  assertTextIncludes(installRoute, "OPENPAWL_INSTALL_DOC", "apps/web/src/routes/openpawl.install.tsx");
  assertTextIncludes(installRoute, "OPENPAWL_RELEASE_URL", "apps/web/src/routes/openpawl.install.tsx");
}

function assertActionRefsUsePayloadTag(file: string, text: string, tag: string): void {
  const actionRefPattern = /codepawl\/openpawl@(v\d+\.\d+\.\d+)/g;
  for (const match of text.matchAll(actionRefPattern)) {
    if (match[1] !== tag) {
      throw new Error(`${file} contains mixed Action ref tag ${match[1]}; expected ${tag}.`);
    }
  }
}

function assertReleaseLockedUrlsUsePayloadTag(file: string, text: string, tag: string): void {
  const releaseUrlPattern = /https:\/\/github\.com\/codepawl\/openpawl\/(?:blob|tree|releases\/tag)\/(v\d+\.\d+\.\d+)/g;
  for (const match of text.matchAll(releaseUrlPattern)) {
    if (match[1] !== tag) {
      throw new Error(`${file} contains mixed release-locked URL tag ${match[1]}; expected ${tag}.`);
    }
  }
}

function assertNoStaleSemver(file: string, text: string, tag: string): void {
  const semverPattern = /\bv\d+\.\d+\.\d+\+?/g;
  for (const match of text.matchAll(semverPattern)) {
    const version = match[0].replace(/\+$/, "");
    if (version !== tag) {
      throw new Error(`${file} contains stale Openpawl version text ${match[0]}; expected ${tag}.`);
    }
  }
}

function assertTextIncludes(text: string, needle: string, file: string): void {
  if (!text.includes(needle)) {
    throw new Error(`${file} is missing expected release metadata: ${needle}`);
  }
}

function buildManifest(payload: OpenpawlReleasePayload): string {
  const docs = payload.docs;
  const providers = payload.capabilities.supportedActionProviders
    .map((provider) => `"${escapeString(provider)}"`)
    .join(", ");

  return `export const OPENPAWL_RELEASE = {
  tag: "${escapeString(payload.tag)}",
  actionRef: "${escapeString(payload.capabilities.actionRef)}",
  repository: "codepawl/openpawl",
  repositoryUrl: "${escapeString(payload.repoUrl)}",
  releaseUrl: "${escapeString(payload.releaseUrl)}",
  publishedAt: "${escapeString(payload.publishedAt)}",
  docs: {
    readme: "${escapeString(docs.readme)}",
    install: "${escapeString(docs.install)}",
    marketplace: "${escapeString(docs.marketplace)}",
    config: "${escapeString(docs.config)}",
    security: "${escapeString(docs.security)}",
    privacy: "${escapeString(docs.privacy)}",
    mainDocs: "https://github.com/codepawl/openpawl/tree/main/docs",
  },
  capabilities: {
    surface: "github-actions",
    githubActions: true,
    mockDefault: ${payload.capabilities.mockDefault},
    supportedActionProviders: [${providers}],
    artifactSchemaVersion: "${escapeString(payload.capabilities.artifactSchemaVersion)}",
    evidenceBundle: ${payload.capabilities.evidenceBundle},
    cloudEvidence: "${escapeString(payload.capabilities.cloudEvidence)}",
    writeMode: "${escapeString(payload.capabilities.writeMode)}",
  },
} as const;

export type OpenpawlRelease = typeof OPENPAWL_RELEASE;
`;
}

function assertObject(value: unknown, path: string): asserts value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }
}

function assertStringArray(value: unknown, path: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string")) {
    throw new Error(`${path} must be a non-empty string array.`);
  }
}

function assertEqual<T>(actual: unknown, expected: T, path: string): asserts actual is T {
  if (actual !== expected) {
    throw new Error(`${path} must equal ${JSON.stringify(expected)}.`);
  }
}

function assertMatches(value: string, pattern: RegExp, path: string): void {
  if (!pattern.test(value)) {
    throw new Error(`${path} has an invalid format.`);
  }
}

function assertOpenpawlUrl(value: string, path: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${path} must be a valid URL.`);
  }

  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    throw new Error(`${path} must be an https://github.com URL.`);
  }

  if (!url.pathname.startsWith("/codepawl/openpawl")) {
    throw new Error(`${path} must point to github.com/codepawl/openpawl.`);
  }
}

function assertIsoDate(value: string, path: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${path} must be an ISO-compatible date string.`);
  }
}

function escapeString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
