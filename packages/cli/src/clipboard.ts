import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { AgentImageInput } from "@codepawl/model-runtime";

const execFileAsync = promisify(execFile);
const MAX_CLIPBOARD_TEXT_BYTES = 64 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;

export type ClipboardReadMode = "auto" | "text" | "image";

export type CliClipboardPreferences = {
  copyOnSelect: boolean;
};

export const DEFAULT_CLI_CLIPBOARD: CliClipboardPreferences = {
  copyOnSelect: false,
};

export function clipboardPreferences(
  value?: Partial<CliClipboardPreferences>,
): CliClipboardPreferences {
  return {
    copyOnSelect: value?.copyOnSelect === true,
  };
}

export function validateClipboardPreferences(
  value: CliClipboardPreferences,
): void {
  if (typeof value.copyOnSelect !== "boolean") {
    throw new Error("Invalid Orynt clipboard preference: copyOnSelect");
  }
}

export type CliClipboardPayload =
  | { kind: "text"; text: string }
  | { kind: "image"; image: AgentImageInput; label: string; width: number; height: number };

export type SmartPastePath =
  | { kind: "path"; path: string; label: string; directory: boolean }
  | { kind: "image"; image: AgentImageInput; label: string; width: number; height: number };

export interface CliClipboardReader {
  read(mode?: ClipboardReadMode): Promise<CliClipboardPayload>;
  writeText(value: string): Promise<void>;
  resolveDroppedPaths(value: string): Promise<SmartPastePath[] | undefined>;
}

export function clipboardWriteCommands(
  platform: NodeJS.Platform,
): ReadonlyArray<readonly [string, readonly string[]]> {
  if (platform === "darwin") return [["pbcopy", []]];
  if (platform === "win32") {
    return [[
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Set-Clipboard -Value ([Console]::In.ReadToEnd())",
      ],
    ]];
  }
  return [
    ["wl-copy", ["--type", "text/plain;charset=utf-8"]],
    ["xclip", ["-selection", "clipboard", "-in"]],
  ];
}

type BunImage = {
  metadata(): Promise<{ width: number; height: number; format: string }>;
  png(options?: { compressionLevel?: number }): BunImage;
  bytes(): Promise<Uint8Array>;
};

type BunImageConstructor = {
  new(input: string | Uint8Array, options?: { maxPixels?: number }): BunImage;
  fromClipboard(): BunImage | null;
};

declare const Bun: {
  Image: BunImageConstructor;
};

export class SystemCliClipboardReader implements CliClipboardReader {
  constructor(private readonly stateRoot: string) {}

  async read(mode: ClipboardReadMode = "auto"): Promise<CliClipboardPayload> {
    if (mode !== "text") {
      const image = await this.readImage();
      if (image) return image;
      if (mode === "image") {
        throw new Error("Clipboard has no supported image.");
      }
    }
    const text = await this.readText();
    if (text !== undefined) return { kind: "text", text };
    if (mode === "text") throw new Error("Clipboard has no text.");
    throw new Error("Clipboard has no supported text or image.");
  }

  async writeText(value: string): Promise<void> {
    let lastError: unknown;
    for (const [command, args] of clipboardWriteCommands(process.platform)) {
      try {
        await writeCommandInput(command, args, value);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("No supported clipboard writer is available.");
  }

  async resolveDroppedPaths(value: string): Promise<SmartPastePath[] | undefined> {
    const candidates = parseDroppedPaths(value);
    if (candidates.length === 0) return undefined;
    const resolved: SmartPastePath[] = [];
    for (const candidate of candidates) {
      const canonical = await realpath(candidate).catch(() => undefined);
      if (!canonical) return undefined;
      const metadata = await stat(canonical).catch(() => undefined);
      if (!metadata) return undefined;
      if (metadata.isFile()) {
        const image = await this.importImageFile(canonical).catch(() => undefined);
        if (image) {
          resolved.push(image);
          continue;
        }
      }
      resolved.push({
        kind: "path",
        path: canonical,
        label: path.basename(canonical) || canonical,
        directory: metadata.isDirectory(),
      });
    }
    return resolved;
  }

  private async readImage(): Promise<Extract<CliClipboardPayload, { kind: "image" }> | undefined> {
    if (process.platform === "linux") {
      for (const [command, args] of [
        ["wl-paste", ["--no-newline", "--type", "image/png"]],
        ["xclip", ["-selection", "clipboard", "-t", "image/png", "-o"]],
      ] as const) {
        const bytes = await execBinary(command, args).catch(() => undefined);
        if (!bytes?.byteLength) continue;
        return this.importImageBytes(bytes, "clipboard.png");
      }
      return undefined;
    }
    const image = Bun.Image.fromClipboard();
    if (!image) return undefined;
    const metadata = await image.metadata();
    validateImageDimensions(metadata.width, metadata.height);
    const bytes = await image.png({ compressionLevel: 6 }).bytes();
    return this.importImageBytes(bytes, "clipboard.png");
  }

  private async readText(): Promise<string | undefined> {
    const commands: ReadonlyArray<readonly [string, readonly string[]]> =
      process.platform === "darwin"
        ? [["pbpaste", []]]
        : process.platform === "win32"
          ? [[
              "powershell.exe",
              ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"],
            ]]
          : [
              ["wl-paste", ["--no-newline", "--type", "text/plain"]],
              ["xclip", ["-selection", "clipboard", "-o"]],
            ];
    for (const [command, args] of commands) {
      const value = await execText(command, args).catch(() => undefined);
      if (value === undefined || value.length === 0) continue;
      if (Buffer.byteLength(value) > MAX_CLIPBOARD_TEXT_BYTES) {
        throw new Error("Clipboard text exceeds the 64 KiB draft limit.");
      }
      return normalizePastedText(value);
    }
    return undefined;
  }

  private async importImageFile(
    source: string,
  ): Promise<Extract<SmartPastePath, { kind: "image" }>> {
    const sourceBytes = await readFile(source);
    const image = new Bun.Image(sourceBytes, { maxPixels: MAX_IMAGE_PIXELS });
    const metadata = await image.metadata();
    validateImageDimensions(metadata.width, metadata.height);
    const png = await image.png({ compressionLevel: 6 }).bytes();
    return this.importImageBytes(png, path.basename(source));
  }

  private async importImageBytes(
    input: Uint8Array,
    label: string,
  ): Promise<Extract<CliClipboardPayload, { kind: "image" }>> {
    const image = new Bun.Image(input, { maxPixels: MAX_IMAGE_PIXELS });
    const metadata = await image.metadata();
    validateImageDimensions(metadata.width, metadata.height);
    const bytes = Buffer.from(
      metadata.format === "png"
        ? input
        : await image.png({ compressionLevel: 6 }).bytes(),
    );
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("Clipboard image exceeds the 20 MiB attachment limit.");
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const root = path.join(this.stateRoot, "attachments", "clipboard");
    const target = path.join(root, `${sha256}.png`);
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(target, bytes, { mode: 0o600 });
    await chmod(target, 0o600);
    return {
      kind: "image",
      image: {
        kind: "local_file",
        path: target,
        mimeType: "image/png",
        sha256,
        byteLength: bytes.byteLength,
        detail: "high",
        source: "user_attachment",
      },
      label,
      width: metadata.width,
      height: metadata.height,
    };
  }
}

export function normalizePastedText(value: string): string {
  return value.replace(/\r\n?/gu, "\n").replace(/\u0000/gu, "");
}

function validateImageDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error("Clipboard image exceeds the 40 megapixel attachment limit.");
  }
}

function parseDroppedPaths(value: string): string[] {
  const normalized = normalizePastedText(value).trim();
  if (!normalized) return [];
  if (normalized.split("\n").every((line) => line.startsWith("file://"))) {
    return normalized.split("\n").map((line) => decodeFileUri(line.trim()));
  }
  const tokens = shellLikePathTokens(normalized);
  return tokens.length > 0 ? tokens : [];
}

function decodeFileUri(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "file:") throw new Error("Dropped URI is not a file path.");
  return decodeURIComponent(url.pathname);
}

function shellLikePathTokens(value: string): string[] {
  const result: string[] = [];
  let token = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else token += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/u.test(character)) {
      if (token) {
        result.push(token);
        token = "";
      }
      continue;
    }
    token += character;
  }
  if (escaped || quote) return [];
  if (token) result.push(token);
  return result;
}

async function execText(command: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync(command, [...args], {
    encoding: "utf8",
    maxBuffer: MAX_CLIPBOARD_TEXT_BYTES + 1,
  });
  return String(stdout);
}

async function execBinary(command: string, args: readonly string[]): Promise<Buffer> {
  const { stdout } = await execFileAsync(command, [...args], {
    encoding: "buffer",
    maxBuffer: MAX_IMAGE_BYTES + 1,
  });
  return Buffer.from(stdout);
}

function writeCommandInput(
  command: string,
  args: readonly string[],
  value: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const succeed = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const child = spawn(command, [...args], {
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", fail);
    child.stdin.once("error", fail);
    child.once("close", (code) => {
      if (code === 0) {
        succeed();
        return;
      }
      fail(
        new Error(
          `${command} exited with code ${code ?? "unknown"}${
            stderr.trim() ? `: ${stderr.trim()}` : ""
          }`,
        ),
      );
    });
    child.stdin.end(value);
  });
}
