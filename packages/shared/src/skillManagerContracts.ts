export type SkillScope = "project" | "user" | "runtime";
export type SkillTrustTier = "builtin" | "trusted" | "community" | "untrusted";
export type SkillHealth = "healthy" | "warning" | "blocked";
export type SkillMutationKind =
  | "install"
  | "update"
  | "enable"
  | "disable"
  | "pin"
  | "unpin"
  | "remove"
  | "restore"
  | "purge"
  | "import";

export type AgentSkillManifestV1 = {
  schemaVersion: 1;
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata: Record<string, unknown>;
  allowedTools: string[];
  rawFrontmatter: Record<string, unknown>;
};

export type SkillSourceKind =
  | "local"
  | "github"
  | "marketplace"
  | "well_known"
  | "direct"
  | "runtime";

export type SkillSourceDescriptor = {
  id: string;
  kind: SkillSourceKind;
  label: string;
  uri: string;
  trustTier: SkillTrustTier;
  enabled: boolean;
  readOnly: boolean;
  refreshedAt?: string;
  etag?: string;
  lastModified?: string;
};

export type SkillReleaseFile = {
  path: string;
  sha256?: string;
  size?: number;
  url?: string;
};

export type SkillRelease = {
  id: string;
  version: string;
  revision: string;
  digest?: string;
  changelog?: string;
  releasedAt?: string;
  manifest: AgentSkillManifestV1;
  files: SkillReleaseFile[];
  capabilities: string[];
  dependencies: string[];
};

export type SkillCatalogItem = {
  id: string;
  sourceId: string;
  publisher: string;
  name: string;
  description: string;
  tags: string[];
  license?: string;
  homepage?: string;
  releases: SkillRelease[];
  trustTier: SkillTrustTier;
  supported: boolean;
  unsupportedReason?: string;
};

export type InstalledSkillRecord = {
  id: string;
  catalogId?: string;
  name: string;
  scope: SkillScope;
  path: string;
  source: SkillSourceDescriptor;
  manifest?: AgentSkillManifestV1;
  version?: string;
  revision?: string;
  digest: string;
  receiptOwned: boolean;
  enabled: boolean;
  eligible: boolean;
  health: SkillHealth;
  warnings: string[];
  pinned: boolean;
  drifted: boolean;
  shadowedBy?: string;
  installedAt?: string;
  updatedAt: string;
};

export type SkillMutationFileDiff = {
  added: string[];
  changed: string[];
  removed: string[];
};

export type SkillMutationPlan = {
  id: string;
  kind: SkillMutationKind;
  skillId: string;
  scope: Exclude<SkillScope, "runtime">;
  sourcePath?: string;
  source?: SkillSourceDescriptor;
  destinationPath: string;
  expectedFingerprint?: string;
  release?: SkillRelease;
  fileDiff: SkillMutationFileDiff;
  capabilityDiff: { added: string[]; removed: string[] };
  dependencyDiff: { added: string[]; removed: string[] };
  trustDecision: SkillTrustTier;
  approvalRequired: boolean;
  approvedAt?: string;
  expiresAt: string;
  createdAt: string;
};

export type SkillReceipt = {
  schemaVersion: 1;
  skillId: string;
  scope: Exclude<SkillScope, "runtime">;
  installPath: string;
  source: SkillSourceDescriptor;
  version?: string;
  revision?: string;
  digest: string;
  files: SkillReleaseFile[];
  installedAt: string;
  updatedAt: string;
  trashedAt?: string;
  trashPath?: string;
};

export type SkillTransactionStatus = "planned" | "approved" | "committed" | "rolled_back" | "failed";

export type SkillTransaction = {
  id: string;
  planId: string;
  kind: SkillMutationKind;
  skillId: string;
  status: SkillTransactionStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
};

export type SkillCollision = {
  name: string;
  winnerId: string;
  shadowedIds: string[];
  reason: "scope_precedence" | "duplicate_realpath" | "case_insensitive_name";
};

export type SkillManagerSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  installed: InstalledSkillRecord[];
  sources: SkillSourceDescriptor[];
  receipts: SkillReceipt[];
  transactions: SkillTransaction[];
  collisions: SkillCollision[];
};

export type SkillContextSnapshot = {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  skills: Array<{
    skillId: string;
    manifest: AgentSkillManifestV1;
    instructions: string;
    resources: Array<{ path: string; content: string; sha256: string }>;
    digest: string;
  }>;
  digest: string;
};

export type SkillManagerEventType =
  | "inventory_scanned"
  | "catalog_refreshed"
  | "mutation_planned"
  | "mutation_approved"
  | "mutation_committed"
  | "mutation_failed"
  | "transaction_recovered"
  | "skill_context_snapshot_created";

export type SkillManagerEvent = {
  id: string;
  type: SkillManagerEventType;
  timestamp: string;
  skillId?: string;
  planId?: string;
  transactionId?: string;
  detail: Record<string, unknown>;
};

export type SkillManagerErrorCode =
  | "invalid_manifest"
  | "source_unavailable"
  | "trust_blocked"
  | "collision"
  | "stale_plan"
  | "digest_mismatch"
  | "local_drift"
  | "transaction_recovery_required"
  | "skill_not_found"
  | "not_receipt_owned"
  | "unsafe_path";
