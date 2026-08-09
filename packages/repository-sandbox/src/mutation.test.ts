import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import {
  RepositoryMutationError,
  RepositoryMutationTransaction,
} from "./mutation.js";

const roots: string[] = [];

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function fixture(): Promise<{
  repositoryPath: string;
  stateRoot: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-mutation-"));
  roots.push(root);
  const repositoryPath = path.join(root, "repository");
  const stateRoot = path.join(root, "state");
  await mkdir(path.join(repositoryPath, "src"), { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await writeFile(path.join(repositoryPath, "src", "one.ts"), "one\n");
  await writeFile(path.join(repositoryPath, "src", "two.ts"), "two\n");
  return { repositoryPath, stateRoot };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    ),
  );
});

describe("RepositoryMutationTransaction", () => {
  it("commits multiple files and can roll the exact transaction back", async () => {
    const fixture_ = await fixture();
    const transaction = new RepositoryMutationTransaction(fixture_);
    const receipt = await transaction.apply({
      previewId: "preview-1",
      previewDigest: hash("preview-1"),
      files: [
        {
          path: "src/one.ts",
          expectedHash: hash("one\n"),
          content: "ONE\n",
        },
        {
          path: "src/two.ts",
          expectedHash: hash("two\n"),
          content: "TWO\n",
        },
      ],
    });
    expect(await readFile(path.join(fixture_.repositoryPath, "src/one.ts"), "utf8"))
      .toBe("ONE\n");
    expect(await readFile(path.join(fixture_.repositoryPath, "src/two.ts"), "utf8"))
      .toBe("TWO\n");

    await transaction.rollback(receipt);
    expect(await readFile(path.join(fixture_.repositoryPath, "src/one.ts"), "utf8"))
      .toBe("one\n");
    expect(await readFile(path.join(fixture_.repositoryPath, "src/two.ts"), "utf8"))
      .toBe("two\n");
    await transaction.finalize(receipt);
  });

  it("rejects stale hashes before writing any file", async () => {
    const fixture_ = await fixture();
    const transaction = new RepositoryMutationTransaction(fixture_);
    await expect(
      transaction.apply({
        previewId: "preview-stale",
        previewDigest: hash("preview-stale"),
        files: [
          {
            path: "src/one.ts",
            expectedHash: hash("stale\n"),
            content: "changed\n",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "EDIT_CONFLICT" });
    expect(await readFile(path.join(fixture_.repositoryPath, "src/one.ts"), "utf8"))
      .toBe("one\n");
  });

  it("rejects symlink mutation targets", async () => {
    const fixture_ = await fixture();
    await symlink(
      path.join(fixture_.repositoryPath, "src", "one.ts"),
      path.join(fixture_.repositoryPath, "src", "link.ts"),
    );
    const transaction = new RepositoryMutationTransaction(fixture_);
    try {
      await transaction.apply({
        previewId: "preview-link",
        previewDigest: hash("preview-link"),
        files: [
          {
            path: "src/link.ts",
            expectedHash: hash("one\n"),
            content: "changed\n",
          },
        ],
      });
      throw new Error("Expected symlink rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(RepositoryMutationError);
      expect((error as RepositoryMutationError).code).toBe("SYMLINK_ESCAPE");
    }
  });

  it("automatically rolls back a committed transaction left by a crashed process", async () => {
    const fixture_ = await fixture();
    const crashed = new RepositoryMutationTransaction({
      ...fixture_,
      leaseStaleMs: 1,
    });
    await crashed.apply({
      previewId: "preview-crash",
      previewDigest: hash("preview-crash"),
      files: [{
        path: "src/one.ts",
        expectedHash: hash("one\n"),
        content: "ONE\n",
      }],
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    const restarted = new RepositoryMutationTransaction({
      ...fixture_,
      leaseStaleMs: 1,
    });
    expect(await restarted.recoverPending()).toEqual([]);
    expect(await readFile(path.join(fixture_.repositoryPath, "src/one.ts"), "utf8"))
      .toBe("one\n");
    expect(await restarted.listRecovery()).toEqual([]);
  });

  it("recovers a file replaced before its applied journal marker was durable", async () => {
    const fixture_ = await fixture();
    const crashed = new RepositoryMutationTransaction({
      ...fixture_,
      leaseStaleMs: 1,
    });
    await crashed.apply({
      previewId: "preview-replacing-window",
      previewDigest: hash("preview-replacing-window"),
      files: [{
        path: "src/one.ts",
        expectedHash: hash("one\n"),
        content: "ONE\n",
      }],
    });
    const repositoryStore = path.join(
      fixture_.stateRoot,
      "code-intel-transactions",
      hash(await import("node:fs/promises").then(({ realpath }) =>
        realpath(fixture_.repositoryPath)
      )),
    );
    const transactionDirectory = (await readdir(repositoryStore))
      .find((entry) => entry.startsWith("mutation-"))!;
    const journalPath = path.join(repositoryStore, transactionDirectory, "journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
      files: Array<{ state: string }>;
      state: string;
    };
    journal.state = "applying";
    journal.files[0]!.state = "replacing";
    await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const restarted = new RepositoryMutationTransaction({
      ...fixture_,
      leaseStaleMs: 1,
    });
    expect(await restarted.recoverPending()).toEqual([]);
    expect(await readFile(path.join(fixture_.repositoryPath, "src/one.ts"), "utf8"))
      .toBe("one\n");
  });

  it("blocks a second transaction instance while the first owns the lease", async () => {
    const fixture_ = await fixture();
    const first = new RepositoryMutationTransaction(fixture_);
    const receipt = await first.apply({
      previewId: "preview-live-lease",
      previewDigest: hash("preview-live-lease"),
      files: [{
        path: "src/one.ts",
        expectedHash: hash("one\n"),
        content: "ONE\n",
      }],
    });
    const second = new RepositoryMutationTransaction(fixture_);
    await expect(second.assertWritable()).rejects.toMatchObject({
      code: "RECOVERY_REQUIRED",
    });
    await first.rollback(receipt);
    await first.finalize(receipt);
  });

  it("blocks new mutations when automatic rollback cannot prove file state", async () => {
    const fixture_ = await fixture();
    const crashed = new RepositoryMutationTransaction({
      ...fixture_,
      leaseStaleMs: 1,
    });
    await crashed.apply({
      previewId: "preview-conflict",
      previewDigest: hash("preview-conflict"),
      files: [{
        path: "src/one.ts",
        expectedHash: hash("one\n"),
        content: "ONE\n",
      }],
    });
    await writeFile(path.join(fixture_.repositoryPath, "src/one.ts"), "user edit\n");

    await new Promise((resolve) => setTimeout(resolve, 5));
    const restarted = new RepositoryMutationTransaction({
      ...fixture_,
      leaseStaleMs: 1,
    });
    const unresolved = await restarted.recoverPending();
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.state).toBe("recovery_required");
    await expect(restarted.assertWritable()).rejects.toMatchObject({
      code: "RECOVERY_REQUIRED",
    });
    await expect(restarted.apply({
      previewId: "preview-blocked",
      previewDigest: hash("preview-blocked"),
      files: [{
        path: "src/two.ts",
        expectedHash: hash("two\n"),
        content: "TWO\n",
      }],
    })).rejects.toMatchObject({ code: "RECOVERY_REQUIRED" });
    expect(await readFile(path.join(fixture_.repositoryPath, "src/two.ts"), "utf8"))
      .toBe("two\n");
  });

  it("rejects metadata, dependency, vendor, and generated mutation roots", async () => {
    const fixture_ = await fixture();
    const transaction = new RepositoryMutationTransaction(fixture_);
    for (const protectedPath of [
      ".git/config",
      "node_modules/pkg/index.js",
      "vendor/code.ts",
      "dist/output.js",
      "generated/client.ts",
    ]) {
      await expect(transaction.apply({
        previewId: `preview-${protectedPath}`,
        previewDigest: hash(protectedPath),
        files: [{
          path: protectedPath,
          expectedHash: hash("anything"),
          content: "changed\n",
        }],
      })).rejects.toMatchObject({ code: "INVALID_WORKSPACE_EDIT" });
    }
  });
});
