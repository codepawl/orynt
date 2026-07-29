import path from "node:path";

export type SkillCliManager = {
  scan(input: Record<string, unknown>): Promise<unknown>;
  list(input: Record<string, unknown>): Promise<unknown>;
  get(input: Record<string, unknown>): Promise<unknown>;
  listSources(input: Record<string, unknown>): Promise<unknown>;
  refresh(input: Record<string, unknown>): Promise<unknown>;
  search(input: Record<string, unknown>): Promise<unknown>;
  plan(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  approve(input: Record<string, unknown>): Promise<unknown>;
  execute(input: Record<string, unknown>): Promise<unknown>;
  history(input: Record<string, unknown>): Promise<unknown>;
  recover(input: Record<string, unknown>): Promise<unknown>;
};

export type SkillCliDependencies = {
  cwd: string;
  isTTY: boolean;
  manager: SkillCliManager;
  write: (value: string) => void;
  confirm?: (prompt: string) => Promise<boolean>;
};

type ParsedSkillArgs = {
  command: string;
  positionals: string[];
  json: boolean;
  dryRun: boolean;
  approveOnce: boolean;
  all: boolean;
  includeRuntimeRoots: boolean;
  scope?: "project" | "user";
  sourceId?: string;
  repositoryPath: string;
};

const MUTATIONS = new Set([
  "install",
  "update",
  "enable",
  "disable",
  "pin",
  "unpin",
  "remove",
  "restore",
  "purge",
  "import",
]);

function help(): string {
  return [
    "Usage: orynt skills <command> [arguments] [options]",
    "",
    "Read-only commands:",
    "  list [--scope project|user] [--runtime] [--json]",
    "  info <skill-id> [--json]",
    "  check [--runtime] [--json]",
    "  search <query> [--source <id>] [--json]",
    "  sources [--json]",
    "  sync [--source <id>] [--json]",
    "  history [--json]",
    "  recover [--dry-run] [--approve-once] [--json]",
    "",
    "Mutation commands:",
    "  install <source-ref> --scope project|user",
    "  update <skill-id>|--all --scope project|user",
    "  enable|disable|pin|unpin|remove <skill-id> --scope project|user",
    "  restore|purge <transaction-or-skill-id> --scope project|user",
    "  import <local-path> --scope project|user",
    "",
    "Mutation options:",
    "  --dry-run       Print the immutable plan without applying it",
    "  --approve-once  Approve exactly this planned operation in headless mode",
    "  --repo <path>   Repository used for project scope (defaults to cwd)",
    "  --json          Emit stable JSON",
  ].join("\n");
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

export function parseSkillCliArgs(argv: string[], cwd: string): ParsedSkillArgs {
  const command = argv[0] ?? "help";
  const positionals: string[] = [];
  let json = false;
  let dryRun = false;
  let approveOnce = false;
  let all = false;
  let includeRuntimeRoots = false;
  let scope: ParsedSkillArgs["scope"];
  let sourceId: string | undefined;
  let repositoryPath = path.resolve(cwd);
  let literal = false;

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (literal) {
      positionals.push(argument);
      continue;
    }
    if (argument === "--") {
      literal = true;
      continue;
    }
    if (argument === "--json") {
      json = true;
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--approve-once") {
      approveOnce = true;
    } else if (argument === "--all") {
      all = true;
    } else if (argument === "--runtime") {
      includeRuntimeRoots = true;
    } else if (argument === "--scope") {
      const value = requireValue(argv, index, argument);
      if (value !== "project" && value !== "user") {
        throw new Error("--scope must be project or user");
      }
      scope = value;
      index += 1;
    } else if (argument === "--source") {
      sourceId = requireValue(argv, index, argument);
      index += 1;
    } else if (argument === "--repo") {
      repositoryPath = path.resolve(
        cwd,
        requireValue(argv, index, argument),
      );
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      return {
        command: "help",
        positionals: [],
        json,
        dryRun,
        approveOnce,
        all,
        includeRuntimeRoots,
        scope,
        sourceId,
        repositoryPath,
      };
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown skills option: ${argument}`);
    } else {
      positionals.push(argument);
    }
  }

  return {
    command,
    positionals,
    json,
    dryRun,
    approveOnce,
    all,
    includeRuntimeRoots,
    scope,
    sourceId,
    repositoryPath,
  };
}

function print(value: unknown, json: boolean, write: (value: string) => void): void {
  if (json) {
    write(JSON.stringify({ schemaVersion: 1, result: value }));
    return;
  }
  if (typeof value === "string") {
    write(value);
    return;
  }
  write(JSON.stringify(value, null, 2));
}

function mutationTarget(args: ParsedSkillArgs): string | undefined {
  return args.positionals[0];
}

async function runMutation(
  args: ParsedSkillArgs,
  dependencies: SkillCliDependencies,
): Promise<number> {
  if (!args.scope) {
    throw new Error(`orynt skills ${args.command} requires --scope project|user`);
  }
  const target = mutationTarget(args);
  if (!target && !(args.command === "update" && args.all)) {
    throw new Error(`orynt skills ${args.command} requires a target`);
  }
  const plan = await dependencies.manager.plan({
    kind: args.command,
    scope: args.scope,
    target,
    all: args.all,
    repositoryPath: args.repositoryPath,
  });
  if (args.dryRun) {
    print(plan, args.json, dependencies.write);
    return 0;
  }

  const planId = typeof plan.id === "string" ? plan.id : undefined;
  if (!planId) {
    throw new Error("skill manager returned a mutation plan without an id");
  }
  if (!args.approveOnce) {
    if (!dependencies.isTTY || !dependencies.confirm) {
      throw new Error("headless skill mutation requires --approve-once");
    }
    const approved = await dependencies.confirm(
      `Approve ${args.command} plan ${planId}?`,
    );
    if (!approved) {
      dependencies.write("Skill mutation canceled.");
      return 1;
    }
  }

  await dependencies.manager.approve({
    planId,
    actor: "operator",
    reason: args.approveOnce
      ? "Explicit --approve-once grant for one skill mutation."
      : "Approved in the interactive Orynt CLI.",
  });
  const result = await dependencies.manager.execute({ planId });
  print(result, args.json, dependencies.write);
  return 0;
}

export async function runSkillCli(
  argv: string[],
  dependencies: SkillCliDependencies,
): Promise<number> {
  let args: ParsedSkillArgs;
  try {
    args = parseSkillCliArgs(argv, dependencies.cwd);
  } catch (error) {
    dependencies.write(
      `Error: ${error instanceof Error ? error.message : String(error)}\n\n${help()}`,
    );
    return 2;
  }

  try {
    if (args.command === "help") {
      dependencies.write(help());
      return 0;
    }
    if (MUTATIONS.has(args.command)) {
      return await runMutation(args, dependencies);
    }

    const common = {
      repositoryPath: args.repositoryPath,
      includeRuntimeRoots: args.includeRuntimeRoots,
      scope: args.scope,
    };
    if (args.command === "list") {
      print(await dependencies.manager.list(common), args.json, dependencies.write);
      return 0;
    }
    if (args.command === "info") {
      if (!args.positionals[0]) throw new Error("orynt skills info requires a skill id");
      print(
        await dependencies.manager.get({ ...common, id: args.positionals[0] }),
        args.json,
        dependencies.write,
      );
      return 0;
    }
    if (args.command === "check") {
      print(await dependencies.manager.scan(common), args.json, dependencies.write);
      return 0;
    }
    if (args.command === "search") {
      const query = args.positionals.join(" ").trim();
      if (!query) throw new Error("orynt skills search requires a query");
      print(
        await dependencies.manager.search({ query, sourceId: args.sourceId }),
        args.json,
        dependencies.write,
      );
      return 0;
    }
    if (args.command === "sources") {
      print(await dependencies.manager.listSources({}), args.json, dependencies.write);
      return 0;
    }
    if (args.command === "sync") {
      print(
        await dependencies.manager.refresh({ sourceId: args.sourceId }),
        args.json,
        dependencies.write,
      );
      return 0;
    }
    if (args.command === "history") {
      print(await dependencies.manager.history({}), args.json, dependencies.write);
      return 0;
    }
    if (args.command === "recover") {
      const result = await dependencies.manager.recover({
        dryRun: args.dryRun,
        approved: args.approveOnce,
      });
      print(result, args.json, dependencies.write);
      return 0;
    }

    throw new Error(`unknown skills command: ${args.command}`);
  } catch (error) {
    dependencies.write(
      args.json
        ? JSON.stringify({
          schemaVersion: 1,
          error: {
            code: "SKILL_COMMAND_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
        })
        : `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}
