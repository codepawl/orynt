import type { Key } from "node:readline";

export type ComposerShortcutAction = "clear" | "undo" | "redo";
export type ComposerShortcutBinding =
  | "escape"
  | `ctrl+${string}`
  | `alt+${string}`;

export type CliShortcutPreferences = Record<
  ComposerShortcutAction,
  ComposerShortcutBinding[]
>;

export const DEFAULT_CLI_SHORTCUTS: CliShortcutPreferences = {
  clear: ["escape", "ctrl+c"],
  undo: ["ctrl+z"],
  redo: ["ctrl+y"],
};

const PORTABLE_BINDINGS = new Set<ComposerShortcutBinding>([
  "escape",
  ..."bcfgnprtxyz".split("").map((key) => `ctrl+${key}` as const),
  ..."abcdefghijklmnopqrstuvwxyz"
    .split("")
    .map((key) => `alt+${key}` as const),
]);

export function normalizeShortcutBinding(
  value: string,
): ComposerShortcutBinding | undefined {
  const normalized = value.trim().toLowerCase().replaceAll(" ", "");
  const binding = normalized === "esc" ? "escape" : normalized;
  return PORTABLE_BINDINGS.has(binding as ComposerShortcutBinding)
    ? binding as ComposerShortcutBinding
    : undefined;
}

export function validateShortcutPreferences(
  value: CliShortcutPreferences,
): void {
  const used = new Set<string>();
  for (const action of ["clear", "undo", "redo"] as const) {
    const bindings = value[action];
    if (
      !Array.isArray(bindings) ||
      bindings.length < 1 ||
      bindings.length > 2
    ) {
      throw new Error("Each shortcut action requires one or two bindings.");
    }
    for (const binding of bindings) {
      if (!PORTABLE_BINDINGS.has(binding)) {
        throw new Error(`Unsupported terminal shortcut: ${binding}`);
      }
      if (used.has(binding)) {
        throw new Error(`Shortcut ${binding} is assigned more than once.`);
      }
      used.add(binding);
    }
  }
}

export function shortcutPreferences(
  value?: CliShortcutPreferences,
): CliShortcutPreferences {
  const next = structuredClone(value ?? DEFAULT_CLI_SHORTCUTS);
  validateShortcutPreferences(next);
  return next;
}

export function shortcutFromKey(
  key: Pick<Key, "name" | "ctrl" | "meta">,
): ComposerShortcutBinding | undefined {
  if (key.name === "escape" && !key.ctrl && !key.meta) return "escape";
  if (key.ctrl && key.name?.length === 1) {
    return normalizeShortcutBinding(`ctrl+${key.name}`);
  }
  if (key.meta && key.name?.length === 1) {
    return normalizeShortcutBinding(`alt+${key.name}`);
  }
  return undefined;
}

export function shortcutMatches(
  preferences: CliShortcutPreferences,
  action: ComposerShortcutAction,
  key: Pick<Key, "name" | "ctrl" | "meta">,
): boolean {
  const binding = shortcutFromKey(key);
  return binding !== undefined && preferences[action].includes(binding);
}

export function shortcutLabel(binding: ComposerShortcutBinding): string {
  if (binding === "escape") return "Esc";
  const [modifier, key] = binding.split("+");
  return `${modifier === "ctrl" ? "Ctrl" : "Alt"}+${key?.toUpperCase()}`;
}

export function shortcutListLabel(
  bindings: readonly ComposerShortcutBinding[],
): string {
  return bindings.map(shortcutLabel).join("/");
}

export function portableShortcutBindings(): ComposerShortcutBinding[] {
  return [...PORTABLE_BINDINGS];
}
