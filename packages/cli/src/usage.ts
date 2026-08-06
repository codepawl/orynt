import type {
  ProviderUsageMeterV1,
  ProviderUsageSnapshotV1,
  ProviderUsageWindowV1,
} from "@codepawl/model-runtime";

import {
  type TerminalThemeId,
} from "./terminal-theme.js";
import {
  createTerminalDesignSystem,
  wrapTerminalParagraph,
} from "./terminal-presentation.js";
import { terminalSafeText } from "./ui.js";

export type ProviderUsageRenderOptions = {
  color: boolean;
  themeId?: TerminalThemeId;
  width?: number;
  verbose?: boolean;
  now?: Date;
};

function wrapLine(value: string, width: number, indent: string): string[] {
  return wrapTerminalParagraph(value, width, {
    firstIndent: indent,
    continuationIndent: indent,
  });
}

function number(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function resetLabel(value: string | undefined, now: Date): string {
  if (!value) return "reset unavailable";
  const reset = new Date(value);
  if (Number.isNaN(reset.getTime())) return "reset unavailable";
  const deltaMinutes = Math.ceil((reset.getTime() - now.getTime()) / 60_000);
  const absolute = `${reset.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  if (deltaMinutes <= 0) return `${absolute} · reset due`;
  const days = Math.floor(deltaMinutes / (24 * 60));
  const hours = Math.floor((deltaMinutes % (24 * 60)) / 60);
  const minutes = deltaMinutes % 60;
  const relative =
    days > 0
      ? `${days}d${hours > 0 ? ` ${hours}h` : ""}`
      : hours > 0
        ? `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`
        : `${minutes}m`;
  return `${absolute} · in ${relative}`;
}

function accountType(value: string): string {
  if (value === "chatgpt") return "ChatGPT";
  if (value === "apiKey") return "API key";
  if (value === "amazonBedrock") return "Amazon Bedrock";
  return value;
}

function windowSummary(window: ProviderUsageWindowV1): string {
  return `${window.label} ${window.remainingPercent}% left`;
}

function primaryMeter(
  snapshot: ProviderUsageSnapshotV1,
): ProviderUsageMeterV1 | undefined {
  return snapshot.meters.find(({ primary }) => primary) ?? snapshot.meters[0];
}

export function providerUsageSummary(
  snapshot: ProviderUsageSnapshotV1,
): string {
  if (snapshot.status === "unavailable") {
    return `${snapshot.provider.label} · unavailable`;
  }
  const meter = primaryMeter(snapshot);
  const plan = snapshot.account?.plan ? ` · ${snapshot.account.plan}` : "";
  if (!meter || meter.windows.length === 0) {
    return `${snapshot.provider.label}${plan} · quota unavailable`;
  }
  const windows = meter.windows
    .slice(0, 2)
    .map(windowSummary)
    .join(" · ");
  const extra = meter.windows.length > 2
    ? ` · +${meter.windows.length - 2} window`
    : "";
  return `${snapshot.provider.label}${plan} · ${windows}${extra}`;
}

export function renderProviderUsage(
  snapshot: ProviderUsageSnapshotV1,
  options: ProviderUsageRenderOptions,
): string {
  const design = createTerminalDesignSystem(options.color, options.themeId);
  const theme = design.theme;
  const width = Math.max(40, options.width ?? 100);
  const now = options.now ?? new Date();
  const statusRole =
    snapshot.status === "ready"
      ? "success"
      : snapshot.status === "degraded"
        ? "attention"
        : "danger";
  const lines = [
    `${design.heading(`${terminalSafeText(snapshot.provider.label)} usage`)} ${design.span("separator", "·")} ${theme.paint(statusRole, snapshot.status)}`,
  ];
  if (snapshot.account) {
    lines.push(
      ...wrapLine(
        `Account  ${accountType(terminalSafeText(snapshot.account.type))}${
          snapshot.account.plan
            ? ` · ${terminalSafeText(snapshot.account.plan)}`
            : ""
        }`,
        width,
        "  ",
      ),
    );
  }
  for (const meter of snapshot.meters) {
    lines.push(
      ...wrapLine(
        `${meter.primary ? "●" : "○"} ${terminalSafeText(meter.label)}${
          meter.limitReachedType
            ? ` · limit reached: ${terminalSafeText(meter.limitReachedType)}`
            : ""
        }`,
        width,
        "  ",
      ),
    );
    for (const window of meter.windows) {
      lines.push(
        ...wrapLine(
          `${terminalSafeText(window.label)}  ${window.usedPercent}% used · ${window.remainingPercent}% left · ${resetLabel(window.resetsAt, now)}`,
          width,
          "      ",
        ),
      );
    }
    if (meter.credits) {
      const credits = meter.credits.unlimited
        ? "unlimited"
        : meter.credits.hasCredits
          ? `available${meter.credits.balance ? ` · balance ${terminalSafeText(meter.credits.balance)}` : ""}`
          : "none";
      lines.push(...wrapLine(`Credits  ${credits}`, width, "      "));
    }
    if (meter.spendControl) {
      lines.push(
        ...wrapLine(
          `Spend  ${terminalSafeText(meter.spendControl.used)} / ${terminalSafeText(meter.spendControl.limit)} · ${meter.spendControl.remainingPercent}% left · ${resetLabel(meter.spendControl.resetsAt, now)}${meter.spendControl.reached ? " · reached" : ""}`,
          width,
          "      ",
        ),
      );
    } else if (meter.spendControlReached !== undefined) {
      lines.push(
        ...wrapLine(
          `Spend control  ${meter.spendControlReached ? "reached" : "within limit"}`,
          width,
          "      ",
        ),
      );
    }
  }
  if (options.verbose && snapshot.analytics) {
    const analytics = snapshot.analytics;
    lines.push("", design.heading("Lifetime usage"));
    const values = [
      analytics.lifetimeTokens === undefined
        ? undefined
        : `Tokens          ${number(analytics.lifetimeTokens)}`,
      analytics.peakDailyTokens === undefined
        ? undefined
        : `Peak daily      ${number(analytics.peakDailyTokens)}`,
      analytics.currentStreakDays === undefined
        ? undefined
        : `Current streak  ${analytics.currentStreakDays} day(s)`,
      analytics.longestStreakDays === undefined
        ? undefined
        : `Longest streak  ${analytics.longestStreakDays} day(s)`,
      analytics.longestRunningTurnSeconds === undefined
        ? undefined
        : `Longest turn    ${number(analytics.longestRunningTurnSeconds)} s`,
    ].filter((value): value is string => value !== undefined);
    for (const value of values) lines.push(...wrapLine(value, width, "  "));
  }
  if (snapshot.issues.length > 0) {
    lines.push("", design.heading("Issues"));
    for (const item of snapshot.issues) {
      const symbol = item.severity === "error"
        ? theme.paint("danger", "✕")
        : theme.paint("attention", "!");
      lines.push(
        ...wrapLine(
          `${symbol} ${terminalSafeText(item.message)} · ${terminalSafeText(item.code)}`,
          width,
          "  ",
        ),
      );
    }
  }
  return lines.map((line) => design.renderProductText(line)).join("\n");
}

export function providerUsageExitCode(
  snapshot: ProviderUsageSnapshotV1,
): 0 | 1 {
  return snapshot.status === "ready" ? 0 : 1;
}

export function providerUsageHelp(): string {
  return [
    "Usage: orynt usage [--verbose] [--json] [--plain]",
    "",
    "Read normalized provider quota and account usage.",
    "",
    "Options:",
    "      --verbose  Include lifetime usage statistics",
    "      --json     Emit the complete structured snapshot",
    "      --plain    Disable ANSI color",
    "  -h, --help     Show help",
  ].join("\n");
}
