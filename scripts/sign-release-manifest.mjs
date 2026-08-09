#!/usr/bin/env bun
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
} from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const rootIndex = process.argv.indexOf("--asset-root");
const versionIndex = process.argv.indexOf("--version");
if (rootIndex < 0 || !process.argv[rootIndex + 1] ||
  versionIndex < 0 || !process.argv[versionIndex + 1]) {
  throw new Error("Usage: sign-release-manifest --asset-root <dir> --version <x.y.z>");
}
const assetRoot = path.resolve(process.argv[rootIndex + 1]);
const version = process.argv[versionIndex + 1];
if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error("Stable semantic version is required.");
const privatePem = process.env.ORYNT_RELEASE_SIGNING_KEY?.replaceAll("\\n", "\n");
const expectedPublicPem = process.env.ORYNT_RELEASE_PUBLIC_KEY?.replaceAll("\\n", "\n");
const keyId = process.env.ORYNT_RELEASE_KEY_ID?.trim();
if (!privatePem || !expectedPublicPem || !keyId) {
  throw new Error(
    "ORYNT_RELEASE_SIGNING_KEY, ORYNT_RELEASE_PUBLIC_KEY, and ORYNT_RELEASE_KEY_ID are required.",
  );
}
const privateKey = createPrivateKey(privatePem);
const actualPublicPem = createPublicKey(privateKey).export({
  type: "spki",
  format: "pem",
}).toString();
if (normalizePem(actualPublicPem) !== normalizePem(expectedPublicPem)) {
  throw new Error("Release signing private key does not match the configured public key.");
}

const files = await walk(assetRoot);
const assets = [];
const expectedAssets = new Set([
  "darwin:arm64",
  "darwin:x64",
  "linux:x64",
  "win32:x64",
]);
const foundAssets = new Set();
for (const filePath of files) {
  const fileName = path.basename(filePath);
  const match = fileName.match(
    /^orynt-(linux|darwin|win32)-(x64|arm64)\.tar\.gz$/u,
  );
  if (!match) continue;
  const identity = `${match[1]}:${match[2]}`;
  if (!expectedAssets.has(identity)) {
    throw new Error(`Unexpected native release asset: ${fileName}`);
  }
  if (foundAssets.has(identity)) {
    throw new Error(`Duplicate native release asset: ${identity}`);
  }
  foundAssets.add(identity);
  const bytes = await readFile(filePath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  await writeFile(`${filePath}.sha256`, `${digest}  ${fileName}\n`);
  assets.push({
    platform: match[1],
    arch: match[2],
    installKind: "native",
    url: `https://github.com/codepawl/orynt/releases/download/v${version}/${fileName}`,
    size: bytes.length,
    sha256: digest,
  });
}
assets.sort((left, right) =>
  `${left.platform}:${left.arch}`.localeCompare(`${right.platform}:${right.arch}`)
);
if (
  foundAssets.size !== expectedAssets.size ||
  [...expectedAssets].some((identity) => !foundAssets.has(identity))
) {
  throw new Error(
    `Native release matrix is incomplete: expected ${[
      ...expectedAssets,
    ].join(", ")}, found ${[...foundAssets].join(", ") || "none"}.`,
  );
}
const unsigned = {
  schemaVersion: 1,
  channel: "stable",
  version,
  publishedAt: new Date().toISOString(),
  minimumCliVersion: "0.1.0",
  keyId,
  assets,
};
const signature = sign(
  null,
  Buffer.from(JSON.stringify(unsigned)),
  privateKey,
).toString("base64");
await writeFile(
  path.join(assetRoot, "release-manifest.json"),
  `${JSON.stringify({ ...unsigned, signature }, null, 2)}\n`,
  { mode: 0o600 },
);
process.stdout.write(`Signed stable manifest for ${version} with ${assets.length} assets.\n`);

async function walk(root) {
  const output = [];
  for (const entry of await readdir(root)) {
    const target = path.join(root, entry);
    if ((await stat(target)).isDirectory()) output.push(...await walk(target));
    else output.push(target);
  }
  return output;
}

function normalizePem(value) {
  return value.trim().replaceAll("\r\n", "\n");
}
