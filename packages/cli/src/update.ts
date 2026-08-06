import { execFile } from "node:child_process";
import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import {
  access,
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { ORYNT_INSTALL_KIND, ORYNT_VERSION } from "./version.js";

const execFileAsync = promisify(execFile);
const DEFAULT_MANIFEST_URL =
  "https://github.com/codepawl/orynt/releases/latest/download/release-manifest.json";
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type ReleaseAssetV1 = {
  platform: NodeJS.Platform;
  arch: string;
  installKind: "native" | "npm";
  url: string;
  size: number;
  sha256: string;
};

export type ReleaseManifestV1 = {
  schemaVersion: 1;
  channel: "stable";
  version: string;
  publishedAt: string;
  minimumCliVersion: string;
  keyId: string;
  assets: ReleaseAssetV1[];
  signature: string;
};

type NativeInstallStateV1 = {
  schemaVersion: 1;
  installKind: "native";
  versionsRoot: string;
  currentPointer: string;
  launcherPath: string;
  currentVersion: string;
  previousVersion?: string;
};

export type UpdateCliDependencies = {
  stateRoot: string;
  write(line: string): void;
  confirm?: (prompt: string) => Promise<boolean>;
  saveStartupConsent?: (consent: "enabled" | "disabled") => Promise<void>;
  fetch?: typeof globalThis.fetch;
  publicKeys?: Record<string, string>;
  manifestUrl?: string;
  execFile?: typeof execFileAsync;
};

export function updateCliHelp(): string {
  return [
    "Usage: orynt update [--check|--rollback|--enable-startup-check|--disable-startup-check] [--yes] [--allow-downgrade]",
    "",
    "Updates use the signed stable release manifest. Startup checks never download artifacts.",
  ].join("\n");
}

export async function runUpdateCli(
  argv: string[],
  dependencies: UpdateCliDependencies,
): Promise<number> {
  const allowed = new Set([
    "--check",
    "--rollback",
    "--yes",
    "--allow-downgrade",
    "--enable-startup-check",
    "--disable-startup-check",
  ]);
  const modes = argv.filter((argument) =>
    [
      "--check",
      "--rollback",
      "--enable-startup-check",
      "--disable-startup-check",
    ].includes(argument)
  );
  if (argv.some((argument) => !allowed.has(argument)) ||
    modes.length > 1) {
    throw new Error(updateCliHelp());
  }
  if (
    argv.includes("--enable-startup-check") ||
    argv.includes("--disable-startup-check")
  ) {
    if (
      argv.length !== 1 ||
      !dependencies.saveStartupConsent
    ) {
      throw new Error(updateCliHelp());
    }
    const consent = argv.includes("--enable-startup-check")
      ? "enabled"
      : "disabled";
    await dependencies.saveStartupConsent(consent);
    dependencies.write(
      consent === "enabled"
        ? "Startup update checks enabled."
        : "Startup update checks disabled.",
    );
    return 0;
  }
  if (argv.includes("--rollback")) {
    if (ORYNT_INSTALL_KIND !== "native") {
      dependencies.write("Rollback is available only for installer-managed native releases.");
      return 1;
    }
    if (!argv.includes("--yes") && !await dependencies.confirm?.("Roll back to the previous version?")) {
      dependencies.write("No change made.");
      return 1;
    }
    const state = await readNativeInstallState(dependencies.stateRoot);
    if (!state.previousVersion) {
      dependencies.write("No previous native version is available.");
      return 1;
    }
    await switchNativeVersion(state, state.previousVersion);
    dependencies.write(`Rolled back Orynt to ${state.previousVersion}.`);
    return 0;
  }

  const manifest = await fetchVerifiedManifest(dependencies);
  if (compareVersions(ORYNT_VERSION, manifest.minimumCliVersion) < 0) {
    dependencies.write(
      `Orynt ${ORYNT_VERSION} is too old for this signed update protocol; reinstall Orynt ${manifest.version} manually.`,
    );
    return 1;
  }
  const comparison = compareVersions(manifest.version, ORYNT_VERSION);
  if (argv.includes("--check")) {
    dependencies.write(
      comparison > 0
        ? `Orynt ${manifest.version} is available; run orynt update.`
        : `Orynt ${ORYNT_VERSION} is current.`,
    );
    return 0;
  }
  if (comparison === 0) {
    dependencies.write(`Orynt ${ORYNT_VERSION} is already current.`);
    return 0;
  }
  if (comparison < 0 && !argv.includes("--allow-downgrade")) {
    dependencies.write("Refusing to downgrade without --allow-downgrade.");
    return 1;
  }
  if (!argv.includes("--yes") &&
    !await dependencies.confirm?.(`Update Orynt to ${manifest.version}?`)) {
    dependencies.write("No change made.");
    return 1;
  }
  if (ORYNT_INSTALL_KIND === "npm") {
    const run = dependencies.execFile ?? execFileAsync;
    await run("npm", ["install", "--global", `orynt@${manifest.version}`], {
      timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    dependencies.write(`Updated npm-managed Orynt to ${manifest.version}.`);
    return 0;
  }
  await installNativeRelease(manifest, dependencies);
  dependencies.write(`Updated Orynt to ${manifest.version}.`);
  return 0;
}

export async function checkForStartupUpdate(input: {
  stateRoot: string;
  consent: "unknown" | "enabled" | "disabled";
  fetch?: typeof globalThis.fetch;
  publicKeys?: Record<string, string>;
  manifestUrl?: string;
}): Promise<string | undefined> {
  if (
    process.env.ORYNT_NO_UPDATE_CHECK === "1" ||
    input.consent !== "enabled"
  ) {
    return undefined;
  }
  const cachePath = path.join(input.stateRoot, "update-check-v1.json");
  const cache = await readFile(cachePath, "utf8").then(
    (value) => JSON.parse(value) as { checkedAt?: string; availableVersion?: string },
    () => undefined,
  );
  if (cache?.checkedAt &&
    Date.now() - Date.parse(cache.checkedAt) < CHECK_INTERVAL_MS) {
    return cache.availableVersion &&
      compareVersions(cache.availableVersion, ORYNT_VERSION) > 0
      ? `Orynt ${cache.availableVersion} is available · run orynt update`
      : undefined;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_000);
  try {
    const manifest = await fetchVerifiedManifest({
      stateRoot: input.stateRoot,
      write: () => undefined,
      fetch: input.fetch,
      manifestUrl: input.manifestUrl,
      ...(input.publicKeys ? { publicKeys: input.publicKeys } : {}),
    }, controller.signal);
    await atomicJson(cachePath, {
      checkedAt: new Date().toISOString(),
      ...(compareVersions(manifest.version, ORYNT_VERSION) > 0
        ? { availableVersion: manifest.version }
        : {}),
    });
    return compareVersions(manifest.version, ORYNT_VERSION) > 0
      ? `Orynt ${manifest.version} is available · run orynt update`
      : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export function verifyReleaseManifest(
  manifest: ReleaseManifestV1,
  publicKeys: Record<string, string>,
): void {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.channel !== "stable" ||
    !/^\d+\.\d+\.\d+$/u.test(manifest.version) ||
    !/^\d+\.\d+\.\d+$/u.test(manifest.minimumCliVersion) ||
    Number.isNaN(Date.parse(manifest.publishedAt)) ||
    !manifest.keyId ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length === 0
  ) {
    throw new Error("Release manifest schema is invalid.");
  }
  for (const asset of manifest.assets) {
    assertSafeReleaseUrl(asset.url);
    if (
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      !/^[a-f0-9]{64}$/u.test(asset.sha256)
    ) {
      throw new Error("Release asset metadata is invalid.");
    }
  }
  const publicKeyPem = publicKeys[manifest.keyId];
  if (!publicKeyPem) {
    throw new Error(`Release manifest uses an unknown signing key: ${manifest.keyId}`);
  }
  const signature = Buffer.from(manifest.signature, "base64");
  const verified = verifySignature(
    null,
    Buffer.from(canonicalManifest(manifest)),
    createPublicKey(publicKeyPem),
    signature,
  );
  if (!verified) throw new Error("Release manifest signature is invalid.");
}

export function canonicalManifest(
  manifest: Omit<ReleaseManifestV1, "signature"> | ReleaseManifestV1,
): string {
  const { signature: _signature, ...unsigned } =
    manifest as ReleaseManifestV1;
  return JSON.stringify(unsigned);
}

async function fetchVerifiedManifest(
  dependencies: UpdateCliDependencies,
  signal?: AbortSignal,
): Promise<ReleaseManifestV1> {
  let publicKeys = dependencies.publicKeys;
  if (!publicKeys) {
    try {
      publicKeys = JSON.parse(
        process.env.ORYNT_RELEASE_PUBLIC_KEYS ?? "{}",
      ) as Record<string, string>;
    } catch {
      throw new Error("Orynt release public-key keyring is malformed.");
    }
  }
  if (
    Object.keys(publicKeys).length === 0 ||
    Object.values(publicKeys).some((value) =>
      !value || value.includes("REPLACE_WITH_PRODUCTION")
    )
  ) {
    throw new Error("Orynt production release public-key keyring is not configured.");
  }
  const fetch_ = dependencies.fetch ?? globalThis.fetch;
  const url = dependencies.manifestUrl ??
    process.env.ORYNT_UPDATE_MANIFEST_URL ??
    DEFAULT_MANIFEST_URL;
  assertSafeReleaseUrl(url);
  const response = await fetchReleaseResponse(fetch_, url, {
    headers: { Accept: "application/json" },
    signal,
  }, MAX_MANIFEST_BYTES);
  if (!response.ok) throw new Error(`Release manifest request failed: ${response.status}`);
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_MANIFEST_BYTES) throw new Error("Release manifest is too large.");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_MANIFEST_BYTES) {
    throw new Error("Release manifest is too large.");
  }
  const manifest = JSON.parse(text) as ReleaseManifestV1;
  verifyReleaseManifest(manifest, publicKeys);
  return manifest;
}

async function installNativeRelease(
  manifest: ReleaseManifestV1,
  dependencies: UpdateCliDependencies,
): Promise<void> {
  const asset = manifest.assets.find(
    (candidate) =>
      candidate.installKind === "native" &&
      candidate.platform === process.platform &&
      candidate.arch === process.arch,
  );
  if (!asset) throw new Error("No signed native asset exists for this platform.");
  if (asset.size > MAX_ARCHIVE_BYTES) throw new Error("Native release archive is too large.");
  const state = await readNativeInstallState(dependencies.stateRoot);
  const response = await fetchReleaseResponse(
    dependencies.fetch ?? globalThis.fetch,
    asset.url,
    {},
    Math.min(asset.size, MAX_ARCHIVE_BYTES),
  );
  if (!response.ok) throw new Error(`Release archive request failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== asset.size ||
    createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
    throw new Error("Release archive checksum or size mismatch.");
  }
  const stagingRoot = path.join(state.versionsRoot, `.staging-${manifest.version}-${process.pid}`);
  const archivePath = path.join(stagingRoot, "release.tar.gz");
  const versionRoot = path.join(state.versionsRoot, manifest.version);
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingRoot, { recursive: true, mode: 0o700 });
  await writeFile(archivePath, bytes, { mode: 0o600, flag: "wx" });
  try {
    const run = dependencies.execFile ?? execFileAsync;
    await run("tar", ["-xzf", archivePath, "-C", stagingRoot], {
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const executable = path.join(
      stagingRoot,
      process.platform === "win32" ? "orynt.exe" : "orynt",
    );
    await access(executable);
    if (process.platform !== "win32") await chmod(executable, 0o755);
    await run(executable, ["--version"], {
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    });
    await rm(archivePath, { force: true });
    await rename(stagingRoot, versionRoot);
    await switchNativeVersion(state, manifest.version);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

async function readNativeInstallState(stateRoot: string): Promise<NativeInstallStateV1> {
  const value = JSON.parse(
    await readFile(path.join(stateRoot, "install-v1.json"), "utf8"),
  ) as Partial<NativeInstallStateV1>;
  if (
    value.schemaVersion !== 1 ||
    value.installKind !== "native" ||
    typeof value.versionsRoot !== "string" ||
    typeof value.currentPointer !== "string" ||
    typeof value.launcherPath !== "string" ||
    typeof value.currentVersion !== "string" ||
    !path.isAbsolute(value.versionsRoot) ||
    !path.isAbsolute(value.currentPointer) ||
    !path.isAbsolute(value.launcherPath)
  ) {
    throw new Error("Native install metadata is missing or invalid; reinstall Orynt.");
  }
  return value as NativeInstallStateV1;
}

async function switchNativeVersion(
  state: NativeInstallStateV1,
  version: string,
): Promise<void> {
  const versionRoot = path.resolve(state.versionsRoot, version);
  if (!versionRoot.startsWith(`${path.resolve(state.versionsRoot)}${path.sep}`)) {
    throw new Error("Native version path escaped the install root.");
  }
  await access(versionRoot);
  if (process.platform === "win32") {
    await atomicText(state.currentPointer, `${version}\n`);
  } else {
    const temporary = `${state.launcherPath}.tmp-${process.pid}`;
    await rm(temporary, { force: true });
    await symlink(path.join(versionRoot, "orynt"), temporary);
    await rename(temporary, state.launcherPath);
  }
  const next: NativeInstallStateV1 = {
    ...state,
    currentVersion: version,
    previousVersion: state.currentVersion,
  };
  await atomicJson(path.join(path.dirname(state.currentPointer), "install-v1.json"), next);
}

function assertSafeReleaseUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol === "https:") return;
  if (
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost")
  ) return;
  throw new Error("Release URL must use HTTPS or a loopback test endpoint.");
}

async function fetchReleaseResponse(
  fetch_: typeof globalThis.fetch,
  initialUrl: string,
  init: RequestInit,
  maximumBytes: number,
): Promise<Response> {
  let currentUrl = new URL(initialUrl);
  const visited = new Set<string>();
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    assertSafeReleaseUrl(currentUrl.toString());
    if (visited.has(currentUrl.toString())) {
      throw new Error("Release request redirect loop detected.");
    }
    visited.add(currentUrl.toString());
    const response = await fetch_(currentUrl, {
      ...init,
      redirect: "manual",
    });
    if (!REDIRECT_STATUSES.has(response.status)) {
      const contentLength = Number(
        response.headers.get("content-length") ?? 0,
      );
      if (
        Number.isFinite(contentLength) &&
        contentLength > maximumBytes
      ) {
        throw new Error("Release response is too large.");
      }
      return response;
    }
    if (redirects === MAX_REDIRECTS) {
      throw new Error("Release request exceeded the redirect limit.");
    }
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Release redirect is missing a Location header.");
    }
    const nextUrl = new URL(location, currentUrl);
    if (
      currentUrl.protocol === "https:" &&
      nextUrl.protocol !== "https:"
    ) {
      throw new Error("Release redirect attempted an HTTPS downgrade.");
    }
    currentUrl = nextUrl;
  }
  throw new Error("Release request exceeded the redirect limit.");
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await atomicText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function atomicText(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, value, { mode: 0o600 });
  await rename(temporary, filePath);
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) =>
    value.split("-", 1)[0]!.split(".").map((part) => Number(part));
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
