import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandRoot = path.join(repositoryRoot, "assets", "brand", "codepawl-orynt");
const manifestPath = path.join(brandRoot, "brand-kit-manifest.json");
const manifestText = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(manifestText);

if (manifestText.includes("/home/") || path.isAbsolute(manifest.native_source)) {
  throw new Error("Brand manifest must contain repository-relative paths only.");
}
if (manifest.brand_family.company !== "CodePawl" || manifest.brand_family.product !== "Orynt") {
  throw new Error("Brand family must preserve CodePawl as company and Orynt as product.");
}
if (manifest.colors.primary !== "#241F1A" || manifest.colors.canvas !== "#F7F3ED") {
  throw new Error("Brand colors do not match the approved kit.");
}

const expectedDimensions = new Map();
const required = [manifest.native_source, ...manifest.previews];
for (const output of Object.values(manifest.outputs)) {
  for (const assetPath of [output.png, output.svg].filter(Boolean)) {
    required.push(assetPath);
    if (assetPath.endsWith(".png")) expectedDimensions.set(assetPath, output.size);
  }
}

for (const relativePath of required) {
  const absolutePath = path.resolve(brandRoot, relativePath);
  if (!absolutePath.startsWith(`${brandRoot}${path.sep}`)) {
    throw new Error(`Brand path escapes the kit: ${relativePath}`);
  }
  await access(absolutePath);
}

for (const [relativePath, [expectedWidth, expectedHeight]] of expectedDimensions) {
  const bytes = await readFile(path.join(brandRoot, relativePath));
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(
      `${relativePath} is ${width}x${height}; expected ${expectedWidth}x${expectedHeight}.`,
    );
  }
}

const consumerFiles = [
  "apps/desktop/public/favicon.svg",
  "apps/desktop/public/favicon-light.svg",
  "apps/desktop/public/favicon-dark.svg",
  "apps/desktop/build/icon.png",
  "apps/desktop/build/icon.ico",
  "apps/desktop/build/icon.icns",
];
await Promise.all(consumerFiles.map((relativePath) => access(path.join(repositoryRoot, relativePath))));

console.log(`Validated ${required.length} canonical assets and ${consumerFiles.length} runtime copies.`);
