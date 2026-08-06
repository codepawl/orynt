export type CliStatuslineField =
  | "enabled"
  | "profile"
  | "role"
  | "model"
  | "effort"
  | "context"
  | "quota"
  | "shortcuts";

export type CliContextFormat = "tokens" | "percent";

export type CliStatuslinePreferences =
  Record<CliStatuslineField, boolean> & {
    contextFormat: CliContextFormat;
  };

export const DEFAULT_CLI_STATUSLINE: CliStatuslinePreferences = {
  enabled: true,
  profile: true,
  role: true,
  model: true,
  effort: true,
  context: true,
  contextFormat: "tokens",
  quota: true,
  shortcuts: false,
};

export function validateStatuslinePreferences(
  value: Partial<CliStatuslinePreferences>,
): void {
  for (const field of [
    "enabled",
    "profile",
    "role",
    "model",
    "effort",
    "context",
    "quota",
    "shortcuts",
  ] as const) {
    if (
      (field === "context" || field === "quota") &&
      value[field] === undefined
    ) {
      continue;
    }
    if (typeof value[field] !== "boolean") {
      throw new Error(`Invalid Orynt statusline preference: ${field}`);
    }
  }
  if (
    value.contextFormat !== undefined &&
    !["tokens", "percent"].includes(value.contextFormat)
  ) {
    throw new Error("Invalid Orynt statusline preference: contextFormat");
  }
}

export function statuslinePreferences(
  value?: Partial<CliStatuslinePreferences>,
): CliStatuslinePreferences {
  const next = {
    ...structuredClone(DEFAULT_CLI_STATUSLINE),
    ...structuredClone(value ?? {}),
  };
  validateStatuslinePreferences(next);
  return next;
}
