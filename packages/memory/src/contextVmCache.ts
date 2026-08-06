import type {
  ContextVmCacheMetricsV1,
  ContextVmMemoryId,
  ContextVmMemoryPageV1,
} from "@codepawl/shared";

export const DEFAULT_CONTEXTVM_CACHE_BYTES = 64 * 1024 * 1024;
export const MAX_CONTEXTVM_CACHE_BYTES = 1024 * 1024 * 1024;

export type ContextVmCacheSignals = {
  currentTaskRelevance?: number;
  dependencyCentrality?: number;
  expectedFutureUse?: number;
  sourceQuality?: number;
  userImportance?: number;
  contradictionPenalty?: number;
  prefetch?: boolean;
};

type CacheEntry = {
  page: ContextVmMemoryPageV1;
  bytes: number;
  lastAccess: number;
  accesses: number;
  pins: Set<string>;
  prefetched: boolean;
  signals: Required<Omit<ContextVmCacheSignals, "prefetch">>;
};

function clamp(value: number | undefined): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? Number(value) : 0));
}

function serializedBytes(page: ContextVmMemoryPageV1): number {
  return Buffer.byteLength(JSON.stringify(page), "utf8");
}

function clonePage(page: ContextVmMemoryPageV1): ContextVmMemoryPageV1 {
  return structuredClone(page);
}

export class DeterministicContextVmPageCache {
  private readonly entries = new Map<ContextVmMemoryId, CacheEntry>();
  private ordinal = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private prefetchLoads = 0;
  private bytes = 0;

  constructor(readonly maxBytes = DEFAULT_CONTEXTVM_CACHE_BYTES) {
    if (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 0 ||
      maxBytes > MAX_CONTEXTVM_CACHE_BYTES ||
      (maxBytes > 0 && maxBytes < 1024 * 1024)
    ) {
      throw new Error(
        "ContextVM cache maxBytes must be 0 or between 1 MiB and 1 GiB",
      );
    }
  }

  get(
    id: ContextVmMemoryId,
    contentHash?: string,
  ): ContextVmMemoryPageV1 | undefined {
    const entry = this.entries.get(id);
    if (!entry || (contentHash && entry.page.contentHash !== contentHash)) {
      if (entry) this.remove(id, false);
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    entry.lastAccess = ++this.ordinal;
    entry.accesses += 1;
    entry.prefetched = false;
    return clonePage(entry.page);
  }

  put(
    page: ContextVmMemoryPageV1,
    signals: ContextVmCacheSignals = {},
  ): boolean {
    if (this.maxBytes === 0) return false;
    const bytes = serializedBytes(page);
    if (bytes > this.maxBytes) return false;
    if (
      signals.prefetch &&
      [...this.entries.values()]
        .filter(({ prefetched }) => prefetched)
        .reduce((sum, entry) => sum + entry.bytes, 0) +
          bytes >
        this.maxBytes * 0.25
    ) {
      return false;
    }
    const existing = this.entries.get(page.id);
    if (existing?.page.contentHash === page.contentHash) {
      existing.lastAccess = ++this.ordinal;
      existing.accesses += 1;
      existing.signals = this.normalizedSignals(signals, existing.signals);
      return true;
    }
    const prior = existing
      ? {
          ...existing,
          page: clonePage(existing.page),
          pins: new Set(existing.pins),
          prefetched: existing.prefetched,
          signals: { ...existing.signals },
        }
      : undefined;
    if (existing) this.remove(page.id, false);
    const entry: CacheEntry = {
      page: clonePage(page),
      bytes,
      lastAccess: ++this.ordinal,
      accesses: 1,
      pins: prior?.pins ?? new Set(),
      prefetched: signals.prefetch === true,
      signals: this.normalizedSignals(signals, prior?.signals),
    };
    this.entries.set(page.id, entry);
    this.bytes += bytes;
    this.evictToBudget(page.id);
    if (this.bytes > this.maxBytes) {
      this.remove(page.id, false);
      if (prior) {
        this.entries.set(prior.page.id, prior);
        this.bytes += prior.bytes;
      }
      return false;
    }
    if (signals.prefetch) this.prefetchLoads += 1;
    return this.entries.has(page.id);
  }

  pin(ids: readonly ContextVmMemoryId[], reason: string): void {
    if (!reason.trim()) throw new Error("ContextVM cache pin reason is required");
    for (const id of ids) this.entries.get(id)?.pins.add(reason);
  }

  unpin(ids: readonly ContextVmMemoryId[], reason: string): void {
    for (const id of ids) this.entries.get(id)?.pins.delete(reason);
    this.evictToBudget();
  }

  metrics(): ContextVmCacheMetricsV1 {
    return {
      maxBytes: this.maxBytes,
      bytes: this.bytes,
      entries: this.entries.size,
      pinnedEntries: [...this.entries.values()].filter(
        ({ pins }) => pins.size > 0,
      ).length,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      prefetchLoads: this.prefetchLoads,
    };
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }

  invalidate(id: ContextVmMemoryId): void {
    this.remove(id, false);
  }

  private normalizedSignals(
    signals: ContextVmCacheSignals,
    fallback?: CacheEntry["signals"],
  ): CacheEntry["signals"] {
    return {
      currentTaskRelevance: clamp(
        signals.currentTaskRelevance ?? fallback?.currentTaskRelevance,
      ),
      dependencyCentrality: clamp(
        signals.dependencyCentrality ?? fallback?.dependencyCentrality,
      ),
      expectedFutureUse: clamp(
        signals.expectedFutureUse ?? fallback?.expectedFutureUse,
      ),
      sourceQuality: clamp(signals.sourceQuality ?? fallback?.sourceQuality),
      userImportance: clamp(
        signals.userImportance ?? fallback?.userImportance,
      ),
      contradictionPenalty: clamp(
        signals.contradictionPenalty ?? fallback?.contradictionPenalty,
      ),
    };
  }

  private evictionScore(entry: CacheEntry): number {
    const age =
      this.ordinal === 0 ? 0 : (this.ordinal - entry.lastAccess) / this.ordinal;
    const accessFrequency = Math.min(1, entry.accesses / 8);
    const tokenCostPenalty = Math.min(
      1,
      entry.page.tokenCount / Math.max(1, entry.page.tokenCount + 1_000),
    );
    const utility =
      0.30 * entry.signals.currentTaskRelevance +
      0.20 * entry.signals.dependencyCentrality +
      0.15 * entry.signals.expectedFutureUse +
      0.10 * (1 - age) +
      0.10 * entry.signals.sourceQuality +
      0.10 * accessFrequency +
      0.05 * entry.signals.userImportance -
      entry.signals.contradictionPenalty -
      tokenCostPenalty * 0.10;
    return utility - age * 0.25;
  }

  private evictToBudget(protectedId?: ContextVmMemoryId): void {
    while (this.bytes > this.maxBytes) {
      const candidates = [...this.entries.entries()]
        .filter(
          ([id, entry]) =>
            id !== protectedId && entry.pins.size === 0,
        )
        .sort(
          ([leftId, left], [rightId, right]) =>
            this.evictionScore(left) - this.evictionScore(right) ||
            left.lastAccess - right.lastAccess ||
            leftId.localeCompare(rightId),
        );
      const candidate = candidates[0]?.[0];
      if (!candidate) break;
      this.remove(candidate, true);
    }
  }

  private remove(id: ContextVmMemoryId, eviction: boolean): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    this.bytes -= entry.bytes;
    if (eviction) this.evictions += 1;
  }
}
