export type ProviderUsageStatus = "ready" | "degraded" | "unavailable";

export type ProviderUsageIssueV1 = {
  code: string;
  message: string;
  severity: "warning" | "error";
};

export type ProviderUsageWindowV1 = {
  id: string;
  label: string;
  usedPercent: number;
  remainingPercent: number;
  windowDurationMinutes?: number;
  resetsAt?: string;
};

export type ProviderUsageCreditsV1 = {
  hasCredits: boolean;
  unlimited: boolean;
  balance?: string;
};

export type ProviderUsageSpendControlV1 = {
  limit: string;
  used: string;
  remainingPercent: number;
  resetsAt: string;
  reached: boolean;
};

export type ProviderUsageMeterV1 = {
  id: string;
  label: string;
  primary: boolean;
  windows: ProviderUsageWindowV1[];
  credits?: ProviderUsageCreditsV1;
  spendControl?: ProviderUsageSpendControlV1;
  spendControlReached?: boolean;
  limitReachedType?: string;
};

export type ProviderUsageAnalyticsV1 = {
  lifetimeTokens?: number;
  peakDailyTokens?: number;
  longestRunningTurnSeconds?: number;
  currentStreakDays?: number;
  longestStreakDays?: number;
  dailyUsage?: Array<{
    startDate: string;
    tokens: number;
  }>;
};

export type ProviderUsageSnapshotV1 = {
  schemaVersion: 1;
  kind: "orynt_provider_usage";
  generatedAt: string;
  status: ProviderUsageStatus;
  provider: {
    id: string;
    label: string;
    transport: string;
  };
  account: {
    type: string;
    plan?: string;
  } | null;
  meters: ProviderUsageMeterV1[];
  analytics?: ProviderUsageAnalyticsV1;
  issues: ProviderUsageIssueV1[];
};

export type ProviderUsageDetail = "quota" | "full";

export interface ProviderUsageReader {
  readonly providerId: string;
  readonly providerLabel: string;
  readUsage(options?: {
    detail?: ProviderUsageDetail;
    timeoutMs?: number;
  }): Promise<ProviderUsageSnapshotV1>;
}
