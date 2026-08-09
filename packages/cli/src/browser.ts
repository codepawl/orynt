import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  OryntCdpBrowserRuntime,
  type BrowserSessionMode,
} from "@codepawl/browser-runtime";

export type BrowserCliCommand =
  | { kind: "doctor" }
  | {
      kind: "start";
      executablePath?: string;
      headless: boolean;
      initialUrl?: string;
      allowedOrigins: string[];
    }
  | { kind: "attach"; browserUrl: string; allowedOrigins: string[] }
  | { kind: "scope"; operation: "list" | "add" | "remove"; origin?: string }
  | { kind: "tabs" }
  | { kind: "status" }
  | { kind: "close" };

export type BrowserSessionDescriptor = {
  schemaVersion: 2;
  mode: BrowserSessionMode;
  webSocketUrl: string;
  allowedOrigins: string[];
  createdAt: string;
  ownedProcessId?: number;
  ownedProfilePath?: string;
};

export type BrowserCliDependencies = {
  env?: NodeJS.ProcessEnv;
  stateRoot: string;
  write: (line: string) => void;
  runtime?: () => OryntCdpBrowserRuntime;
  findChrome?: () => Promise<string | undefined>;
};

export function parseBrowserCliArgs(argv: string[]): BrowserCliCommand {
  const kind = argv[0];
  if (!["doctor", "start", "attach", "scope", "tabs", "status", "close"].includes(kind ?? "")) {
    throw new Error(browserCliHelp());
  }
  if (kind === "doctor" || kind === "tabs" || kind === "status" || kind === "close") {
    if (argv.length !== 1) throw new Error(`orynt browser ${kind} does not accept options`);
    return { kind };
  }
  if (kind === "scope") {
    const operation = argv[1];
    if (operation === "list" && argv.length === 2) {
      return { kind, operation };
    }
    if (
      (operation === "add" || operation === "remove") &&
      argv.length === 3
    ) {
      return {
        kind,
        operation,
        origin: normalizeBrowserOrigin(argv[2]),
      };
    }
    throw new Error(
      "orynt browser scope requires list, add <origin>, or remove <origin>",
    );
  }
  if (kind === "attach") {
    let browserUrl: string | undefined;
    const allowedOrigins: string[] = [];
    for (let index = 1; index < argv.length; index += 1) {
      const option = argv[index];
      const value = argv[index + 1];
      if (!value) throw new Error(`${option} requires a value`);
      if (option === "--browser-url") browserUrl = value;
      else if (option === "--allow-origin") {
        allowedOrigins.push(normalizeBrowserOrigin(value));
      } else {
        throw new Error(`Unknown browser attach option: ${option}`);
      }
      index += 1;
    }
    if (!browserUrl || allowedOrigins.length === 0) {
      throw new Error(
        "orynt browser attach requires --browser-url http://127.0.0.1:<port> and at least one --allow-origin https://example.com",
      );
    }
    const url = new URL(browserUrl);
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
      throw new Error("Browser attach is limited to a loopback CDP endpoint");
    }
    return {
      kind,
      browserUrl,
      allowedOrigins: uniqueOrigins(allowedOrigins),
    };
  }
  let executablePath: string | undefined;
  let initialUrl: string | undefined;
  let headless = true;
  const allowedOrigins: string[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--headed") {
      headless = false;
    } else if (
      option === "--executable" ||
      option === "--url" ||
      option === "--allow-origin"
    ) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${option} requires a value`);
      if (option === "--executable") executablePath = path.resolve(value);
      else if (option === "--url") initialUrl = value;
      else allowedOrigins.push(normalizeBrowserOrigin(value));
      index += 1;
    } else {
      throw new Error(`Unknown browser start option: ${option}`);
    }
  }
  if (initialUrl) {
    const initialOrigin = navigableOrigin(initialUrl);
    if (initialOrigin) allowedOrigins.push(initialOrigin);
  }
  return {
    kind: "start",
    ...(executablePath ? { executablePath } : {}),
    headless,
    ...(initialUrl ? { initialUrl } : {}),
    allowedOrigins: uniqueOrigins(allowedOrigins),
  };
}

export async function runBrowserCli(
  argv: string[],
  dependencies: BrowserCliDependencies,
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const command = parseBrowserCliArgs(argv);
  const sessionPath = path.join(dependencies.stateRoot, "browser", "session.json");
  const findChrome = dependencies.findChrome ?? (() => findChromeExecutable(env));

  if (command.kind === "doctor") {
    const executable = await findChrome();
    const descriptor = await readDescriptor(sessionPath);
    dependencies.write([
      "Orynt browser doctor",
      "  Runtime: available on explicit start or attach",
      `  Chrome: ${executable ? `ready · ${executable}` : "not found · set CHROME_FOR_TESTING_PATH"}`,
      `  Session: ${descriptor ? `${descriptor.mode} · ${descriptor.allowedOrigins.length} allowed origin(s)` : "none"}`,
      "  Boundary: loopback CDP only; no cookies, credentials, raw scripts, uploads, downloads, proxy, or cloud browser",
    ].join("\n"));
    return executable || descriptor ? 0 : 1;
  }

  if (command.kind === "start") {
    const executablePath = command.executablePath ?? await findChrome();
    if (!executablePath) {
      dependencies.write("Chrome for Testing was not found. Set CHROME_FOR_TESTING_PATH or pass --executable.");
      return 2;
    }
    const runtime = dependencies.runtime?.() ?? new OryntCdpBrowserRuntime();
    const ownedProfilePath = path.join(
      dependencies.stateRoot,
      "browser",
      "profiles",
      `isolated-${Date.now()}`,
    );
    await runtime.start({
      executablePath,
      userDataDir: ownedProfilePath,
      headless: command.headless,
      initialUrl: command.initialUrl,
      detached: true,
      allowedOrigins: command.allowedOrigins,
    });
    const endpoint = runtime.webSocketUrl;
    if (!endpoint) throw new Error("Browser runtime started without a CDP endpoint");
    await writeDescriptor(sessionPath, {
      schemaVersion: 2,
      mode: "isolated",
      webSocketUrl: endpoint,
      allowedOrigins: command.allowedOrigins,
      createdAt: new Date().toISOString(),
      ...(runtime.processId ? { ownedProcessId: runtime.processId } : {}),
      ownedProfilePath,
    });
    const pages = await runtime.listPages();
    await runtime.disconnect();
    dependencies.write(`Browser started · isolated · ${pages.length} page(s)`);
    return 0;
  }

  if (command.kind === "attach") {
    const runtime = dependencies.runtime?.() ?? new OryntCdpBrowserRuntime();
    await runtime.attach({
      browserUrl: command.browserUrl,
      allowedOrigins: command.allowedOrigins,
    });
    const endpoint = runtime.webSocketUrl;
    if (!endpoint) throw new Error("Attached browser did not expose a CDP endpoint");
    await writeDescriptor(sessionPath, {
      schemaVersion: 2,
      mode: "attached",
      webSocketUrl: endpoint,
      allowedOrigins: command.allowedOrigins,
      createdAt: new Date().toISOString(),
    });
    const pages = await runtime.listPages();
    await runtime.disconnect();
    dependencies.write(`Browser attached explicitly · ${pages.length} page(s)`);
    return 0;
  }

  const descriptor = await readDescriptor(sessionPath);
  if (!descriptor) {
    dependencies.write(
      "No scoped browser session. Start or attach again with an explicit allowed origin.",
    );
    return 1;
  }
  if (command.kind === "scope") {
    if (command.operation === "list") {
      dependencies.write(
        descriptor.allowedOrigins.length > 0
          ? descriptor.allowedOrigins.join("\n")
          : "No browser origins are allowed.",
      );
      return 0;
    }
    const origin = command.origin!;
    const nextOrigins =
      command.operation === "add"
        ? uniqueOrigins([...descriptor.allowedOrigins, origin])
        : descriptor.allowedOrigins.filter((candidate) => candidate !== origin);
    await writeDescriptor(sessionPath, {
      ...descriptor,
      allowedOrigins: nextOrigins,
    });
    dependencies.write(
      command.operation === "add"
        ? `Browser origin allowed: ${origin}`
        : `Browser origin removed: ${origin}`,
    );
    return 0;
  }
  const runtime = dependencies.runtime?.() ?? new OryntCdpBrowserRuntime();
  try {
    await runtime.attach(
      {
        webSocketUrl: descriptor.webSocketUrl,
        allowedOrigins: descriptor.allowedOrigins,
      },
      descriptor.mode,
    );
    if (command.kind === "tabs") {
      const pages = await runtime.listPages();
      dependencies.write(pages.length
        ? pages.map((page) =>
            `${page.id}\t${safeBrowserText(page.title) || "(untitled)"}\t${redactBrowserUrl(page.url)}`
          ).join("\n")
        : "No page targets.");
      await runtime.disconnect();
      return 0;
    }
    if (command.kind === "status") {
      const pages = await runtime.listPages();
      dependencies.write(`Browser ready · ${descriptor.mode} · ${pages.length} page(s)`);
      await runtime.disconnect();
      return 0;
    }
    if (descriptor.mode === "isolated") await runtime.close();
    else await runtime.disconnect();
    await unlink(sessionPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    dependencies.write("Browser session closed.");
    return 0;
  } catch (error) {
    await runtime.disconnect().catch(() => undefined);
    await unlink(sessionPath).catch((unlinkError: NodeJS.ErrnoException) => {
      if (unlinkError.code !== "ENOENT") throw unlinkError;
    });
    dependencies.write(`Browser session unavailable: ${safeMessage(error)}`);
    return 1;
  }
}

export function browserCliHelp(): string {
  return [
    "Usage: orynt browser <command>",
    "",
    "Commands:",
    "  doctor",
    "  start [--headed] [--executable /absolute/path] [--url https://...] [--allow-origin https://...]",
    "  attach --browser-url http://127.0.0.1:<port> --allow-origin https://...",
    "  scope list",
    "  scope add <origin>",
    "  scope remove <origin>",
    "  tabs",
    "  status",
    "  close",
  ].join("\n");
}

async function findChromeExecutable(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const platformCandidates =
    process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
          path.join(
            os.homedir(),
            "Applications",
            "Google Chrome.app",
            "Contents",
            "MacOS",
            "Google Chrome",
          ),
        ]
      : process.platform === "win32"
        ? [
            env.PROGRAMFILES &&
              path.join(
                env.PROGRAMFILES,
                "Google",
                "Chrome",
                "Application",
                "chrome.exe",
              ),
            env["PROGRAMFILES(X86)"] &&
              path.join(
                env["PROGRAMFILES(X86)"],
                "Google",
                "Chrome",
                "Application",
                "chrome.exe",
              ),
            env.LOCALAPPDATA &&
              path.join(
                env.LOCALAPPDATA,
                "Google",
                "Chrome",
                "Application",
                "chrome.exe",
              ),
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
          ];
  const candidates = [
    env.CHROME_FOR_TESTING_PATH,
    env.CHROME_PATH,
    ...platformCandidates,
    path.join(os.homedir(), ".cache", "ms-playwright", "chromium_headless_shell"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next explicit, system, or automation browser path.
    }
  }
  return undefined;
}

export async function readBrowserSessionDescriptor(
  stateRoot: string,
): Promise<BrowserSessionDescriptor | undefined> {
  return readDescriptor(path.join(stateRoot, "browser", "session.json"));
}

async function readDescriptor(filePath: string): Promise<BrowserSessionDescriptor | undefined> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<BrowserSessionDescriptor>;
    if (
      parsed.schemaVersion !== 2 ||
      !["isolated", "attached"].includes(parsed.mode ?? "") ||
      typeof parsed.webSocketUrl !== "string" ||
      !Array.isArray(parsed.allowedOrigins) ||
      !parsed.allowedOrigins.every(
        (origin) =>
          typeof origin === "string" &&
          normalizeBrowserOrigin(origin) === origin,
      ) ||
      typeof parsed.createdAt !== "string" ||
      (parsed.ownedProcessId !== undefined &&
        (!Number.isInteger(parsed.ownedProcessId) || parsed.ownedProcessId <= 0)) ||
      (parsed.ownedProfilePath !== undefined &&
        (typeof parsed.ownedProfilePath !== "string" ||
          !path.isAbsolute(parsed.ownedProfilePath)))
    ) return undefined;
    return parsed as BrowserSessionDescriptor;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
}

async function writeDescriptor(filePath: string, descriptor: BrowserSessionDescriptor): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
}

function safeMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/(cookie|authorization|token|password|secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .slice(0, 500);
}

function redactBrowserUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[invalid-url]";
  }
}

function safeBrowserText(value: string): string {
  return value
    .replace(
      /\b(?:token|secret|password|api[_ -]?key)\s*[:=]\s*\S+/giu,
      "[REDACTED]",
    )
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .slice(0, 500);
}

export function normalizeBrowserOrigin(raw: string): string {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Browser origins must use http or https");
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Browser origin scope must contain only scheme, host, and optional port",
    );
  }
  return url.origin;
}

function navigableOrigin(raw: string): string | undefined {
  const url = new URL(raw);
  if (url.protocol === "about:") return undefined;
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Browser URLs must use http, https, or about");
  }
  return url.origin;
}

function uniqueOrigins(origins: string[]): string[] {
  return [...new Set(origins)].sort();
}
