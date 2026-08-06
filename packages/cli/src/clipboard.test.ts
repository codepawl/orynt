import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import {
  clipboardWriteCommands,
  normalizePastedText,
  SystemCliClipboardReader,
} from "./clipboard";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("CLI clipboard", () => {
  it("uses structured platform clipboard writer commands", () => {
    expect(clipboardWriteCommands("darwin")).toEqual([["pbcopy", []]]);
    expect(clipboardWriteCommands("win32")).toEqual([[
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Set-Clipboard -Value ([Console]::In.ReadToEnd())",
      ],
    ]]);
    expect(clipboardWriteCommands("linux")).toEqual([
      ["wl-copy", ["--type", "text/plain;charset=utf-8"]],
      ["xclip", ["-selection", "clipboard", "-in"]],
    ]);
  });

  it("normalizes terminal newlines and removes NUL bytes", () => {
    expect(normalizePastedText("one\r\ntwo\rthree\u0000")).toBe(
      "one\ntwo\nthree",
    );
  });

  it("recognizes dropped files, directories, and file URIs as path tokens", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-clipboard-test-"));
    roots.push(root);
    const stateRoot = path.join(root, "state");
    const directory = path.join(root, "folder");
    const file = path.join(root, "notes.txt");
    await mkdir(directory);
    await writeFile(file, "notes");
    const clipboard = new SystemCliClipboardReader(stateRoot);

    await expect(
      clipboard.resolveDroppedPaths(`"${file}" '${directory}'`),
    ).resolves.toEqual([
      {
        kind: "path",
        path: file,
        label: "notes.txt",
        directory: false,
      },
      {
        kind: "path",
        path: directory,
        label: "folder",
        directory: true,
      },
    ]);
    await expect(
      clipboard.resolveDroppedPaths(new URL(`file://${file}`).href),
    ).resolves.toEqual([
      {
        kind: "path",
        path: file,
        label: "notes.txt",
        directory: false,
      },
    ]);
  });

  it("leaves ordinary pasted text untouched by smart path handling", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-clipboard-test-"));
    roots.push(root);
    const clipboard = new SystemCliClipboardReader(path.join(root, "state"));
    await expect(
      clipboard.resolveDroppedPaths("please inspect this repository"),
    ).resolves.toBeUndefined();
  });
});
