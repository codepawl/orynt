import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const packagesRoot = path.join(repositoryRoot, "packages");
const portableExtension = /\.(?:c|m)?js$|\.json$/u;
const relativeSpecifier =
  /\b(?:from\s*|import\s*\(\s*|import\s*)["'](\.{1,2}\/[^"']+)["']/gu;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
    ) return [absolute];
    return [];
  }));
  return nested.flat();
}

const packageEntries = await readdir(packagesRoot, { withFileTypes: true });
const files = (
  await Promise.all(packageEntries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const sourceRoot = path.join(packagesRoot, entry.name, "src");
      try {
        return await sourceFiles(sourceRoot);
      } catch (error) {
        if (error?.code === "ENOENT") return [];
        throw error;
      }
    }))
).flat();

const violations = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(relativeSpecifier)) {
    const specifier = match[1];
    if (!portableExtension.test(specifier)) {
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(
        `${path.relative(repositoryRoot, file)}:${line} ${specifier}`,
      );
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(
    `Non-portable relative ESM specifiers:\n${violations.join("\n")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Portable ESM check passed for ${files.length} production TypeScript files.\n`,
  );
}
