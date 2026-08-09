#!/usr/bin/env bun
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const publicGuides = [
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "SUPPORT.md",
  "CODE_OF_CONDUCT.md",
  "docs/getting-started.md",
  "docs/release/github-publication.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/bug.yml",
  ".github/ISSUE_TEMPLATE/feature.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
];

const bannedText = [
  "—",
  "–",
  "Cognitive computer-use agent",
  "closed-source",
  "brain-like operating system",
  "first-class product surfaces",
];

const errors = [];
for (const relativePath of publicGuides) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");
  for (const text of bannedText) {
    if (source.includes(text)) {
      errors.push(`${relativePath} contains banned public copy: ${text}`);
    }
  }
  if (!relativePath.endsWith(".md")) continue;
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].replace(/^<|>$/gu, "");
    const target = rawTarget.split("#")[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/iu.test(target)) continue;
    const resolved = path.resolve(
      path.dirname(absolutePath),
      decodeURIComponent(target),
    );
    await access(resolved).catch(() => {
      errors.push(`${relativePath} has a missing link target: ${rawTarget}`);
    });
  }
}

const readme = await readFile(path.join(repositoryRoot, "README.md"), "utf8");
if (!readme.includes("**An agent that just works.**")) {
  errors.push("README.md must use the approved tagline");
}

const publication = await readFile(
  path.join(repositoryRoot, "docs/release/github-publication.md"),
  "utf8",
);
if (!publication.includes('> An agent that just works.')) {
  errors.push("GitHub publication guide must use the approved description");
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Public docs passed style and link checks for ${publicGuides.length} files.\n`,
  );
}
