import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCANNED_ROOT_FILES = new Set([
  "AGENTS.md",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "DESIGN.md",
  "PRODUCT.md",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
]);

const SCANNED_DIRECTORIES = [
  ".github",
  "apps",
  "assets",
  "docs",
  "packages",
  "scripts",
];

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".plist",
  ".ps1",
  ".py",
  ".sh",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  "build",
  "coverage",
  "dist",
  "apps/desktop/dist",
  "fixtures",
  "node_modules",
  "release",
]);

const IGNORED_PATH_PREFIXES = [
  "assets/fonts/",
  "docs/release/evidence/",
];

const IGNORED_EXACT_PATHS = new Set([
  // This checker contains the exact reviewed multilingual exception data.
  "scripts/english-copy-check.mjs",
]);

const INTERNAL_MULTILINGUAL_LINES = new Map([
  [
    "apps/desktop/src/App.tsx",
    new Set([
      'return /^(?:test|testing|smoke\\s*test|ping)(?:\\s+(?:nè|ne|nha|nhé|nhe|thử|thu|xem|coi|lại|lai|đi|di))*[.!?\\s]*$/iu.test(normalizeSelectedText(prompt));',
    ]),
  ],
  [
    "packages/agent-runtime/src/repositoryAction.ts",
    new Set([
      '/\\b(delete|remove|rename|migrat|install|dependency|dependencies|lockfile|lock file|large refactor|broad change|xóa|xoá|cài đặt|phụ thuộc|di chuyển)\\b/i;',
    ]),
  ],
  [
    "packages/coding-apprentice/src/index.ts",
    new Set([
      '/(đọc|doc|xem|khảo sát|khao sat|phân tích|phan tich|tóm tắt|tom tat|giải thích|giai thich|review).*\\b(repo|repository|codebase)\\b/,',
      '/\\b(repo|repository|codebase)\\b.*(đọc|doc|xem|khảo sát|khao sat|phân tích|phan tich|tóm tắt|tom tat|giải thích|giai thich|review)/,',
      '/(đọc|doc|xem|khảo sát|khao sat|phân tích|phan tich|tóm tắt|tom tat|giải thích|giai thich|review).*(mã nguồn|ma nguon|dự án|du an)/,',
      '/(mã nguồn|ma nguon|dự án|du an).*(đọc|doc|xem|khảo sát|khao sat|phân tích|phan tich|tóm tắt|tom tat|giải thích|giai thich|review)/,',
      'const writeIntentPattern = /\\b(build|create|implement|fix|repair|change|modify|update|add|remove|delete|refactor|migrate|generate|scaffold|write|sửa|sua|tạo|tao|thêm|them|xóa|xoa|đổi|doi|cập nhật|cap nhat)\\b/;',
    ]),
  ],
  [
    "packages/cli/src/agent.ts",
    new Set([
      "return /(?:^|[.!?\\n]\\s*|\\b(?:please|can you|hãy|vui lòng)\\s+)(?:do not\\s+|don't\\s+|không\\s+)?(?:build|create|implement|fix|update|add|remove|change|write|modify|repair|refactor|xây dựng|tạo|triển khai|sửa|cập nhật|thêm|xóa|thay đổi)\\b/iu",
      "!/^(?:do not|don't|không)\\s+(?:build|create|implement|fix|update|add|remove|change|write|modify|repair|refactor|xây dựng|tạo|triển khai|sửa|cập nhật|thêm|xóa|thay đổi)\\b/iu",
    ]),
  ],
  [
    "packages/shared/src/modelTierContracts.ts",
    new Set([
      "/\\b(?:do not|don't|never|must not|without|avoid|no|không|đừng|không được|tránh)\\b[^.!?;\\n]{0,120}$/iu;",
      "/(?:[.!?;\\n]+|\\b(?:but|however|then|nhưng|tuy nhiên|sau đó)\\b)/iu,",
    ]),
  ],
]);

function normalizedRelativePath(value) {
  return value.split(path.sep).join("/");
}

function ignoredPath(relativePath, entryName, isDirectory) {
  if (IGNORED_EXACT_PATHS.has(relativePath)) return true;
  if (isDirectory && IGNORED_DIRECTORY_NAMES.has(entryName)) return true;
  if (IGNORED_PATH_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) {
    return true;
  }
  if (/(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/u.test(relativePath)) return true;
  return false;
}

/**
 * Characters used as technical glyphs rather than as prose.
 *
 * `Δ` labels a diff in the terminal icon set beside `≡`, `⌕`, `▶`, `✎`, and
 * `◆`. Those siblings pass only because Unicode classifies them as symbols;
 * `Δ` fails on the accident that it is classified as a letter. Excluding it
 * keeps this check about authored copy rather than about the icon table.
 *
 * Keep this set to characters that carry no language. Anything that could read
 * as a word belongs in the reviewed multilingual line data instead, where the
 * whole line is recorded and can be re-reviewed.
 */
const GLYPH_CHARACTERS = new Set(["Δ"]);

function isNonEnglishAlphabetic(character) {
  if (character.codePointAt(0) <= 0x7f) return false;
  if (GLYPH_CHARACTERS.has(character)) return false;
  return /\p{Letter}/u.test(character);
}

function containsNonEnglishAlphabeticCharacter(value) {
  for (const character of value) {
    if (isNonEnglishAlphabetic(character)) return true;
  }
  return false;
}

function nonEnglishCharacters(value) {
  return [...new Set([...value].filter(isNonEnglishAlphabetic))].join(" ");
}

async function collectTextFiles(repositoryRoot) {
  const files = [];

  for (const relativePath of SCANNED_ROOT_FILES) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    if (await stat(absolutePath).then((value) => value.isFile()).catch(() => false)) {
      files.push(relativePath);
    }
  }

  async function walk(relativeDirectory) {
    const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
    const entries = await readdir(absoluteDirectory, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      const relativePath = normalizedRelativePath(
        path.join(relativeDirectory, entry.name),
      );
      if (ignoredPath(relativePath, entry.name, entry.isDirectory())) continue;
      if (entry.isDirectory()) {
        await walk(relativePath);
      } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(relativePath);
      }
    }
  }

  for (const relativeDirectory of SCANNED_DIRECTORIES) {
    await walk(relativeDirectory);
  }
  return files.sort();
}

export async function findEnglishCopyViolations(
  repositoryRoot,
  { allowInternalMultilingualLines = true } = {},
) {
  const violations = [];
  const files = await collectTextFiles(repositoryRoot);
  for (const relativePath of files) {
    const source = await readFile(path.join(repositoryRoot, relativePath), "utf8");
    const allowedLines = allowInternalMultilingualLines
      ? INTERNAL_MULTILINGUAL_LINES.get(relativePath)
      : undefined;
    for (const [index, line] of source.split(/\r?\n/u).entries()) {
      if (!containsNonEnglishAlphabeticCharacter(line)) continue;
      if (allowedLines?.has(line.trim())) continue;
      violations.push({
        relativePath,
        line: index + 1,
        characters: nonEnglishCharacters(line),
      });
    }
  }
  return { filesScanned: files.length, violations };
}

async function main() {
  const rootFlagIndex = process.argv.indexOf("--root");
  const repositoryRoot = rootFlagIndex >= 0
    ? path.resolve(process.argv[rootFlagIndex + 1] ?? "")
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = await findEnglishCopyViolations(repositoryRoot);
  if (result.violations.length > 0) {
    for (const violation of result.violations) {
      process.stderr.write(
        `${violation.relativePath}:${violation.line} contains non-English alphabetic characters: ${violation.characters}\n`,
      );
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `English copy check passed for ${result.filesScanned} authored text files.\n`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
