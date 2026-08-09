import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  CodeIntelService,
  FileMutationPreviewStore,
  createMutationApprovalBundle,
} from "@codepawl/code-intel-runtime";
import {
  LspAdapterRegistry,
  validateCustomAdapterExecutable,
  type CustomLanguageServerAdapter,
} from "@codepawl/lsp-runtime";
import { RepositoryMutationTransaction } from "@codepawl/repository-sandbox";

type LspAdapterFile = {
  schemaVersion: 1;
  adapters: CustomLanguageServerAdapter[];
};

function adapterPath(stateRoot: string): string {
  return path.join(stateRoot, "lsp", "adapters.v1.json");
}

export async function loadCustomLspAdapters(
  stateRoot: string,
): Promise<CustomLanguageServerAdapter[]> {
  try {
    const raw = await readFile(adapterPath(stateRoot));
    if (raw.byteLength > 64 * 1024) {
      throw new Error("Custom LSP adapter file exceeds 64 KB.");
    }
    const parsed = JSON.parse(raw.toString("utf8")) as LspAdapterFile;
    if (
      parsed.schemaVersion !== 1 ||
      !Array.isArray(parsed.adapters) ||
      parsed.adapters.length > 32
    ) {
      throw new Error("Invalid custom LSP adapter file.");
    }
    return parsed.adapters;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function saveCustomLspAdapters(
  stateRoot: string,
  adapters: CustomLanguageServerAdapter[],
): Promise<void> {
  if (adapters.length > 32) throw new Error("At most 32 custom LSP adapters are allowed.");
  const target = adapterPath(stateRoot);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(
    temporary,
    `${JSON.stringify({ schemaVersion: 1, adapters } satisfies LspAdapterFile, null, 2)}\n`,
    { mode: 0o600, flag: "wx" },
  );
  await rename(temporary, target);
  if (process.platform !== "win32") await chmod(target, 0o600);
}

function values(args: string[], flag: string): string[] {
  const output: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index]?.startsWith(`${flag}=`)) {
      const inline = args[index]!.slice(flag.length + 1);
      if (!inline) throw new Error(`${flag} requires a value.`);
      output.push(...inline.split(",").map((item) => item.trim()).filter(Boolean));
      continue;
    }
    if (args[index] !== flag) continue;
    const value = args[index + 1];
    if (!value || (flag !== "--arg" && value.startsWith("--"))) {
      throw new Error(`${flag} requires a value.`);
    }
    output.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
    index += 1;
  }
  return output;
}

function value(args: string[], flag: string): string | undefined {
  return values(args, flag)[0];
}

function positiveInteger(args: string[], flag: string): number {
  const raw = value(args, flag);
  const parsed = Number(raw);
  if (!raw || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} requires a positive integer.`);
  }
  return parsed;
}

async function runRefactorCli(
  args: string[],
  dependencies: {
    cwd: string;
    stateRoot: string;
    write(value: string): void;
  },
): Promise<number> {
  if (process.env.ORYNT_INSTALL_KIND === "native") {
    throw Object.assign(
      new Error(
        "Persistent LSP refactoring requires the npm distribution until the native companion runtime is available.",
      ),
      { code: "RUNTIME_DEGRADED" },
    );
  }
  const json = args.includes("--json");
  const subcommand = args.find((argument) => !argument.startsWith("--"));
  const service = new CodeIntelService({
    previewStore: new FileMutationPreviewStore({
      stateRoot: dependencies.stateRoot,
      maxEntries: 128,
      maxBytes: 10 * 1024 * 1024,
    }),
  });
  await service.open(dependencies.cwd);
  try {
    if (subcommand === "rename-preview") {
      const filePath = value(args, "--path");
      const newName = value(args, "--new-name");
      if (!filePath || !newName) {
        throw new Error(
          "Usage: orynt lsp refactor rename-preview --path <relative> --line <n> --column <n> --new-name <name> [--json]",
        );
      }
      const result = await service.renamePreview({
        selector: {
          kind: "position",
          path: filePath,
          line: positiveInteger(args, "--line"),
          column: positiveInteger(args, "--column"),
          coordinates: "one_based_unicode_scalar",
        },
        newName,
      });
      if (json) dependencies.write(JSON.stringify(result, null, 2));
      else {
        const preview = result.data.preview;
        if (!preview) throw new Error("Language server did not create a rename preview.");
        dependencies.write(preview.unifiedDiff);
        dependencies.write(`Preview id: ${preview.previewId}`);
        dependencies.write(`Preview digest: ${preview.previewDigest}`);
      }
      return result.status === "ok" ? 0 : 1;
    }
    if (subcommand === "apply") {
      const previewId = value(args, "--preview-id");
      const previewDigest = value(args, "--preview-digest");
      if (!previewId || !previewDigest) {
        throw new Error(
          "Usage: orynt lsp refactor apply --preview-id <id> --preview-digest <sha256> --approve-once [--json]",
        );
      }
      const preview = service.mutationPreview(previewId, previewDigest);
      if (!args.includes("--approve-once")) {
        if (json) {
          dependencies.write(JSON.stringify({
            protocol: "orynt.code-intel",
            schemaVersion: 1,
            status: "error",
            error: {
              code: "APPROVAL_REQUIRED",
              message:
                "Exact-preview headless apply requires --approve-once.",
              retryable: false,
            },
            preview,
          }, null, 2));
        } else {
          dependencies.write(preview.unifiedDiff);
          dependencies.write(
            "Approval required: rerun with the exact preview id, digest, and --approve-once.",
          );
        }
        return 2;
      }
      const result = await service.applyPreview({
        previewId,
        previewDigest,
        approval: createMutationApprovalBundle({ preview }),
        runtime: new RepositoryMutationTransaction({
          repositoryPath: dependencies.cwd,
          stateRoot: dependencies.stateRoot,
        }),
      });
      if (json) dependencies.write(JSON.stringify(result, null, 2));
      else {
        dependencies.write(
          `Applied preview ${previewId} to ${result.data.changedFiles.join(", ")}.`,
        );
      }
      return result.status === "ok" ? 0 : 1;
    }
    throw new Error(
      "Usage: orynt lsp refactor <rename-preview|apply> [options]",
    );
  } finally {
    await service.close();
  }
}

export async function runLspCli(
  argv: string[],
  dependencies: {
    cwd: string;
    stateRoot: string;
    write(value: string): void;
    restart(adapterId: string): Promise<void>;
  },
): Promise<number> {
  const [command = "list", ...args] = argv;
  const json = args.includes("--json");
  if (command === "refactor") {
    return await runRefactorCli(args, dependencies);
  }
  if (command === "recovery") {
    const [recoveryCommand = "list", transactionId] = args.filter(
      (argument) => !argument.startsWith("--"),
    );
    const transaction = new RepositoryMutationTransaction({
      repositoryPath: dependencies.cwd,
      stateRoot: dependencies.stateRoot,
    });
    if (recoveryCommand === "list") {
      const items = await transaction.listRecovery();
      if (json) dependencies.write(JSON.stringify({ recovery: items }, null, 2));
      else if (items.length === 0) dependencies.write("No pending LSP mutations.");
      else for (const item of items) {
        dependencies.write(
          `${item.transactionId} ${item.state} · ${item.changedFiles.join(", ") || "no applied files"}`,
        );
      }
      return items.some(({ state }) => state === "recovery_required") ? 1 : 0;
    }
    if (recoveryCommand === "retry") {
      if (!transactionId) {
        throw new Error("Usage: orynt lsp recovery retry <transaction-id>");
      }
      await transaction.retryRecovery(transactionId);
      dependencies.write(`Recovered LSP mutation: ${transactionId}`);
      return 0;
    }
    throw new Error("Usage: orynt lsp recovery <list|retry> [transaction-id] [--json]");
  }
  if (command === "list" || command === "doctor") {
    const custom = await loadCustomLspAdapters(dependencies.stateRoot);
    const registry = new LspAdapterRegistry(custom);
    const detected = await registry.detect(dependencies.cwd);
    const recovery = command === "doctor"
      ? await new RepositoryMutationTransaction({
          repositoryPath: dependencies.cwd,
          stateRoot: dependencies.stateRoot,
        }).listRecovery()
      : [];
    const data = {
      repositoryPath: path.resolve(dependencies.cwd),
      recovery,
      runtime: process.env.ORYNT_INSTALL_KIND === "native"
        ? {
            distribution: "native",
            status: "degraded",
            reason:
              "Persistent LSP requires the npm distribution until the native companion runtime is available.",
          }
        : {
            distribution: "npm",
            status: "available",
            reason: null,
          },
      adapters: registry.list().map((adapter) => ({
        id: adapter.id,
        title: adapter.title,
        languages: adapter.languages,
        distribution: adapter.distribution,
        tier: adapter.tier,
        detected: detected.find(({ adapterId }) => adapterId === adapter.id) ??
          null,
      })),
    };
    if (json) {
      dependencies.write(JSON.stringify(data, null, 2));
    } else {
      for (const adapter of data.adapters) {
        dependencies.write(
          `${adapter.id.padEnd(12)} ${adapter.tier} · ${adapter.detected?.availability ?? "not-detected"} · ${adapter.languages.join(", ")}`,
        );
        if (command === "doctor" && adapter.detected?.detail) {
          dependencies.write(`  ${adapter.detected.detail}`);
        }
      }
      if (command === "doctor") {
        dependencies.write(
          `runtime ${data.runtime.status} · ${data.runtime.distribution}`,
        );
        if (data.runtime.reason) dependencies.write(`  ${data.runtime.reason}`);
        dependencies.write(
          `mutation-recovery ${recovery.length === 0 ? "clean" : `${recovery.length} pending`}`,
        );
      }
    }
    return command === "doctor" &&
        detected.some(({ availability }) => availability === "broken")
      || recovery.some(({ state }) => state === "recovery_required")
      ? 1
      : 0;
  }
  if (command === "restart") {
    const adapterId = args.find((argument) => !argument.startsWith("--"));
    if (!adapterId) throw new Error("Usage: orynt lsp restart <adapter-id>");
    await dependencies.restart(adapterId);
    dependencies.write(`Restarted LSP adapter: ${adapterId}`);
    return 0;
  }
  if (command === "add") {
    const adapter: CustomLanguageServerAdapter = {
      schemaVersion: 1,
      id: value(args, "--id") ?? "",
      languages: values(args, "--language"),
      extensions: values(args, "--extension").map((extension) =>
        extension.startsWith(".") ? extension : `.${extension}`
      ),
      rootMarkers: values(args, "--root-marker"),
      command: value(args, "--command") ?? "",
      args: values(args, "--arg"),
    };
    adapter.command = await validateCustomAdapterExecutable(adapter);
    const current = await loadCustomLspAdapters(dependencies.stateRoot);
    if (current.some(({ id }) => id === adapter.id)) {
      throw new Error(`Custom LSP adapter already exists: ${adapter.id}`);
    }
    await saveCustomLspAdapters(dependencies.stateRoot, [...current, adapter]);
    dependencies.write(`Added custom LSP adapter: ${adapter.id}`);
    return 0;
  }
  if (command === "remove") {
    const adapterId = args.find((argument) => !argument.startsWith("--"));
    if (!adapterId) throw new Error("Usage: orynt lsp remove <adapter-id>");
    const current = await loadCustomLspAdapters(dependencies.stateRoot);
    const next = current.filter(({ id }) => id !== adapterId);
    if (next.length === current.length) {
      throw new Error(`Custom LSP adapter not found: ${adapterId}`);
    }
    await saveCustomLspAdapters(dependencies.stateRoot, next);
    dependencies.write(`Removed custom LSP adapter: ${adapterId}`);
    return 0;
  }
  throw new Error(
    "Usage: orynt lsp <list|doctor|restart|add|remove|recovery|refactor> [options]",
  );
}
