import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "bun:test";

import { findEnglishCopyViolations } from "./english-copy-check.mjs";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-english-copy-"));
  try {
    await mkdir(path.join(root, "docs"), { recursive: true });
    await mkdir(path.join(root, "packages", "example", "src"), {
      recursive: true,
    });
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("accepts English authored copy and language-neutral symbols", async () => {
  await withFixture(async (root) => {
    await writeFile(
      path.join(root, "docs", "guide.md"),
      "# Guide\n\nSelect -> approve -> execute.\n\n♚♛♜♝♞♟ ♠♣♥♦\n",
    );
    const result = await findEnglishCopyViolations(root, {
      allowInternalMultilingualLines: false,
    });
    assert.deepEqual(result.violations, []);
  });
});

test("reports non-English authored copy with its file and line", async () => {
  await withFixture(async (root) => {
    await writeFile(
      path.join(root, "packages", "example", "src", "copy.ts"),
      'export const label = "Xin chào";\n',
    );
    const result = await findEnglishCopyViolations(root, {
      allowInternalMultilingualLines: false,
    });
    assert.deepEqual(result.violations, [
      {
        relativePath: "packages/example/src/copy.ts",
        line: 1,
        characters: "à",
      },
    ]);
  });
});

test("does not treat test fixtures as Orynt-authored product copy", async () => {
  await withFixture(async (root) => {
    await writeFile(
      path.join(root, "packages", "example", "src", "width.test.ts"),
      'assert.equal(displayWidth("界"), 2);\n',
    );
    const result = await findEnglishCopyViolations(root, {
      allowInternalMultilingualLines: false,
    });
    assert.deepEqual(result.violations, []);
  });
});

test("allows a diff glyph without allowing prose in the same script", async () => {
  await withFixture(async (root) => {
    await writeFile(
      path.join(root, "packages", "example", "src", "icons.ts"),
      'export const icons = { diff: "Δ", list: "≡", run: "▶" };\n',
    );
    const allowed = await findEnglishCopyViolations(root, {
      allowInternalMultilingualLines: false,
    });
    assert.deepEqual(allowed.violations, []);

    // The allowance is one language-neutral glyph, not the Greek alphabet:
    // a word must still be reported.
    await writeFile(
      path.join(root, "packages", "example", "src", "icons.ts"),
      'export const label = "παράδειγμα";\n',
    );
    const reported = await findEnglishCopyViolations(root, {
      allowInternalMultilingualLines: false,
    });
    assert.equal(reported.violations.length, 1);
  });
});
