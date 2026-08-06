import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readdir, realpath, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

import type {
  LspAdapterTier,
  LspAdapterDistribution,
  LspCommandSpec,
  LspDetectedRoot,
} from "./types.js";

const execFileAsync = promisify(execFile);
const require = process.env.ORYNT_INSTALL_KIND === "native"
  ? createRequire(path.join(path.dirname(process.execPath), "package.json"))
  : createRequire(import.meta.url);

export type LanguageServerAdapter = {
  id: string;
  title: string;
  languages: string[];
  extensions: string[];
  rootMarkers: string[];
  distribution: LspAdapterDistribution;
  tier: LspAdapterTier;
  command(root: string): Promise<LspCommandSpec>;
  probe(root: string): Promise<LspDetectedRoot>;
};

export type CustomLanguageServerAdapter = {
  schemaVersion: 1;
  id: string;
  languages: string[];
  extensions: string[];
  rootMarkers: string[];
  command: string;
  args: string[];
};

type AdapterDefinition = Omit<
  LanguageServerAdapter,
  "command" | "probe"
> & {
  executable: string;
  args: string[];
  versionArgs?: string[];
  initializationOptions?: unknown | (() => unknown);
  workspaceConfiguration?: unknown;
  bundledModule?: string;
};

function fingerprint(definition: AdapterDefinition, executable: string): string {
  const initializationOptions =
    typeof definition.initializationOptions === "function"
      ? definition.initializationOptions()
      : definition.initializationOptions;
  return createHash("sha256")
    .update(JSON.stringify({
      adapter: definition.id,
      executable,
      args: definition.args,
      initializationOptions,
      workspaceConfiguration: definition.workspaceConfiguration,
    }))
    .digest("hex");
}

function adapter(definition: AdapterDefinition): LanguageServerAdapter {
  const resolveExecutable = (): { command: string; args: string[] } => {
    if (!definition.bundledModule) {
      return { command: definition.executable, args: definition.args };
    }
    return {
      // The bundled language servers are Node-targeted upstream programs.
      // Orynt itself runs on Bun, while this isolated compatibility boundary
      // keeps their documented runtime semantics intact.
      command: definition.executable,
      args: [require.resolve(definition.bundledModule), ...definition.args],
    };
  };
  return {
    id: definition.id,
    title: definition.title,
    languages: definition.languages,
    extensions: definition.extensions,
    rootMarkers: definition.rootMarkers,
    distribution: definition.distribution,
    tier: definition.tier,
    async command(root) {
      const resolved = resolveExecutable();
      const initializationOptions =
        typeof definition.initializationOptions === "function"
          ? definition.initializationOptions()
          : definition.initializationOptions;
      return {
        command: resolved.command,
        args: resolved.args,
        cwd: root,
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
        fingerprint: fingerprint(definition, resolved.command),
        ...(initializationOptions === undefined
          ? {}
          : { initializationOptions }),
        ...(definition.workspaceConfiguration === undefined
          ? {}
          : { workspaceConfiguration: definition.workspaceConfiguration }),
      };
    },
    async probe(root) {
      if (definition.distribution === "bundled") {
        try {
          resolveExecutable();
          return {
            adapterId: definition.id,
            root,
            languages: definition.languages,
            distribution: definition.distribution,
            tier: definition.tier,
            availability: "bundled",
          };
        } catch (error) {
          return {
            adapterId: definition.id,
            root,
            languages: definition.languages,
            distribution: definition.distribution,
            tier: definition.tier,
            availability: "broken",
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      }
      try {
        const { stdout, stderr } = await execFileAsync(
          definition.executable,
          definition.versionArgs ?? ["--version"],
          { cwd: root, timeout: 5_000, maxBuffer: 128_000 },
        );
        const version = `${stdout}\n${stderr}`.trim().split(/\r?\n/u)[0];
        return {
          adapterId: definition.id,
          root,
          languages: definition.languages,
          distribution: definition.distribution,
          tier: definition.tier,
          availability: version ? "ready" : "unverified",
          ...(version ? { version: version.slice(0, 200) } : {}),
        };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        return {
          adapterId: definition.id,
          root,
          languages: definition.languages,
          distribution: definition.distribution,
          tier: definition.tier,
          availability: code === "ENOENT" ? "missing" : "broken",
          detail: error instanceof Error
            ? error.message.slice(0, 500)
            : String(error).slice(0, 500),
        };
      }
    },
  };
}

const DEFINITIONS: AdapterDefinition[] = [
  {
    id: "typescript",
    title: "TypeScript and JavaScript",
    languages: ["typescript", "typescriptreact", "javascript", "javascriptreact"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    rootMarkers: ["tsconfig.json", "jsconfig.json", "package.json"],
    distribution: "bundled",
    tier: "tier_a",
    executable: "node",
    bundledModule: "typescript-language-server/lib/cli.mjs",
    args: ["--stdio", "--log-level", "2"],
    initializationOptions: () => ({
      hostInfo: "orynt",
      tsserver: {
        path: require.resolve("typescript/lib/tsserver.js"),
        useSyntaxServer: "auto",
        useClientFileWatcher: false,
      },
      preferences: { includeInlayParameterNameHints: "none" },
    }),
  },
  {
    id: "python",
    title: "Python",
    languages: ["python"],
    extensions: [".py", ".pyi"],
    rootMarkers: ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile"],
    distribution: "bundled",
    tier: "tier_a",
    executable: "node",
    bundledModule: "pyright/langserver.index.js",
    args: ["--stdio"],
  },
  {
    id: "json",
    title: "JSON",
    languages: ["json", "jsonc"],
    extensions: [".json", ".jsonc"],
    rootMarkers: ["package.json"],
    distribution: "bundled",
    tier: "tier_b",
    executable: "node",
    bundledModule:
      "vscode-langservers-extracted/bin/vscode-json-language-server",
    args: ["--stdio"],
  },
  {
    id: "html",
    title: "HTML",
    languages: ["html"],
    extensions: [".html", ".htm"],
    rootMarkers: ["package.json"],
    distribution: "bundled",
    tier: "tier_b",
    executable: "node",
    bundledModule:
      "vscode-langservers-extracted/bin/vscode-html-language-server",
    args: ["--stdio"],
  },
  {
    id: "css",
    title: "CSS",
    languages: ["css", "scss", "less"],
    extensions: [".css", ".scss", ".less"],
    rootMarkers: ["package.json"],
    distribution: "bundled",
    tier: "tier_b",
    executable: "node",
    bundledModule:
      "vscode-langservers-extracted/bin/vscode-css-language-server",
    args: ["--stdio"],
  },
  {
    id: "yaml",
    title: "YAML",
    languages: ["yaml"],
    extensions: [".yaml", ".yml"],
    rootMarkers: [".yamllint", "package.json"],
    distribution: "bundled",
    tier: "tier_b",
    executable: "node",
    bundledModule: "yaml-language-server/bin/yaml-language-server",
    args: ["--stdio"],
    workspaceConfiguration: {
      yaml: {
        validate: true,
        hover: true,
        completion: true,
        schemaStore: { enable: false },
      },
    },
  },
  {
    id: "bash",
    title: "Bash",
    languages: ["shellscript"],
    extensions: [".sh", ".bash", ".zsh"],
    rootMarkers: [".shellcheckrc"],
    distribution: "bundled",
    tier: "tier_b",
    executable: "node",
    bundledModule: "bash-language-server/out/cli.js",
    args: ["start"],
  },
  {
    id: "rust",
    title: "Rust",
    languages: ["rust"],
    extensions: [".rs"],
    rootMarkers: ["Cargo.toml"],
    distribution: "system",
    tier: "tier_a",
    executable: "rust-analyzer",
    args: [],
  },
  {
    id: "go",
    title: "Go",
    languages: ["go"],
    extensions: [".go"],
    rootMarkers: ["go.work", "go.mod"],
    distribution: "system",
    tier: "tier_c",
    executable: "gopls",
    args: ["serve"],
    versionArgs: ["version"],
  },
  {
    id: "clangd",
    title: "C and C++",
    languages: ["c", "cpp", "objective-c", "objective-cpp"],
    extensions: [".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh"],
    rootMarkers: [".clangd", "compile_commands.json", "CMakeLists.txt"],
    distribution: "system",
    tier: "tier_c",
    executable: "clangd",
    args: ["--background-index"],
  },
  {
    id: "java",
    title: "Java",
    languages: ["java"],
    extensions: [".java"],
    rootMarkers: ["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle"],
    distribution: "system",
    tier: "tier_c",
    executable: "jdtls",
    args: [],
  },
  {
    id: "csharp",
    title: "C#",
    languages: ["csharp"],
    extensions: [".cs"],
    rootMarkers: [".sln", ".slnx", ".csproj"],
    distribution: "system",
    tier: "tier_c",
    executable: "csharp-ls",
    args: [],
  },
  {
    id: "lua",
    title: "Lua",
    languages: ["lua"],
    extensions: [".lua"],
    rootMarkers: [".luarc.json", ".luarc.jsonc"],
    distribution: "system",
    tier: "tier_c",
    executable: "lua-language-server",
    args: [],
  },
];

export class LspAdapterRegistry {
  private readonly adapters = new Map<string, LanguageServerAdapter>();

  constructor(custom: CustomLanguageServerAdapter[] = []) {
    for (const definition of DEFINITIONS) {
      const value = adapter(definition);
      this.adapters.set(value.id, value);
    }
    for (const definition of custom) {
      const value = customAdapter(definition);
      if (this.adapters.has(value.id)) {
        throw new Error(`Custom LSP adapter shadows a built-in id: ${value.id}`);
      }
      this.adapters.set(value.id, value);
    }
  }

  list(): LanguageServerAdapter[] {
    return [...this.adapters.values()];
  }

  get(id: string): LanguageServerAdapter | undefined {
    return this.adapters.get(id);
  }

  async detect(repositoryPath: string): Promise<LspDetectedRoot[]> {
    const repository = await realpath(repositoryPath);
    const detected: LspDetectedRoot[] = [];
    for (const value of this.adapters.values()) {
      const roots = await detectRoots(
        repository,
        value.rootMarkers,
        value.extensions,
      );
      for (const root of roots) detected.push(await value.probe(root));
    }
    return detected;
  }
}

const IGNORED_ROOT_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".orynt",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);

async function detectRoots(
  repository: string,
  markers: string[],
  extensions: string[],
): Promise<string[]> {
  const roots = new Set<string>();
  let observedSource = false;
  let visited = 0;
  const queue = [repository];
  while (queue.length > 0 && visited < 10_000 && roots.size < 8) {
    const directory = queue.shift()!;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    visited += entries.length;
    const fileNames = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    const hasMarker = markers.some(
      (marker) =>
        fileNames.includes(marker) ||
        (/^\.[a-z0-9]+$/iu.test(marker) &&
          fileNames.some(
            (name) => path.extname(name).toLowerCase() === marker.toLowerCase(),
          )),
    );
    if (hasMarker) roots.add(directory);
    if (
      fileNames.some((name) =>
        extensions.includes(path.extname(name).toLowerCase())
      )
    ) {
      observedSource = true;
    }
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !entry.isSymbolicLink() &&
        !IGNORED_ROOT_DIRECTORIES.has(entry.name)
      ) {
        queue.push(path.join(directory, entry.name));
      }
    }
  }
  if (roots.size === 0 && observedSource) roots.add(repository);
  return [...roots];
}

function customAdapter(
  custom: CustomLanguageServerAdapter,
): LanguageServerAdapter {
  validateCustomAdapter(custom);
  return adapter({
    id: custom.id,
    title: custom.id,
    languages: custom.languages,
    extensions: custom.extensions,
    rootMarkers: custom.rootMarkers,
    distribution: "custom",
    tier: "custom",
    executable: custom.command,
    args: custom.args,
  });
}

export function validateCustomAdapter(
  value: CustomLanguageServerAdapter,
): void {
  if (value.schemaVersion !== 1) {
    throw new Error("Custom LSP adapter schemaVersion must be 1.");
  }
  if (!/^[a-z][a-z0-9-]{1,47}$/u.test(value.id)) {
    throw new Error("Custom LSP adapter id is invalid.");
  }
  if (!path.isAbsolute(value.command)) {
    throw new Error("Custom LSP command must be an absolute path.");
  }
  if (value.args.length > 16) {
    throw new Error("Custom LSP adapter accepts at most 16 arguments.");
  }
  if (value.languages.length === 0 || value.extensions.length === 0) {
    throw new Error(
      "Custom LSP adapter requires at least one language and extension.",
    );
  }
  if (
    value.rootMarkers.some((marker) =>
      marker.includes("/") || marker.includes("\\") || marker === ".."
    )
  ) {
    throw new Error("Custom LSP root markers must be simple file names.");
  }
}

export async function validateCustomAdapterExecutable(
  value: CustomLanguageServerAdapter,
): Promise<string> {
  validateCustomAdapter(value);
  const executable = await realpath(value.command);
  const metadata = await stat(executable);
  if (!metadata.isFile()) throw new Error("Custom LSP command is not a file.");
  if (process.platform !== "win32" && (metadata.mode & 0o111) === 0) {
    throw new Error("Custom LSP command is not executable.");
  }
  return executable;
}
