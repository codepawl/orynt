import { describe, expect, it } from "bun:test";

import {
  contextVmEventId,
  contextVmMemoryId,
  type ContextVmMemoryPageV1,
} from "@codepawl/shared";

import { DeterministicContextVmPageCache } from "./contextVmCache";

function page(
  suffix: string,
  contentBytes = 180_000,
): ContextVmMemoryPageV1 {
  return {
    schemaVersion: 1,
    id: contextVmMemoryId(
      `mem_0000000001_${suffix.repeat(24).slice(0, 24)}`,
    ),
    namespace: "test",
    kind: "fact",
    status: "active",
    summary: `page ${suffix}`,
    content: { text: suffix.repeat(contentBytes) },
    normalizedContent: suffix.repeat(contentBytes),
    sources: [{
      type: "event",
      eventId: contextVmEventId(
        `evt_0000000001_${suffix.repeat(24).slice(0, 24)}`,
      ),
    }],
    entityIds: [suffix],
    taskIds: [],
    relations: [],
    validFrom: "2026-08-05T00:00:00.000Z",
    confidence: 1,
    importance: 0.5,
    evidencePriority: "verified_tool",
    producer: "test",
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    tokenCount: contentBytes / 4,
    contentHash: suffix.repeat(64).slice(0, 64),
  };
}

describe("DeterministicContextVmPageCache", () => {
  it("evicts the least useful unpinned page deterministically", () => {
    const cache = new DeterministicContextVmPageCache(1024 * 1024);
    const first = page("a");
    const second = page("b");
    const third = page("c");
    expect(cache.put(first)).toBe(true);
    expect(cache.put(second)).toBe(true);
    expect(cache.get(first.id)).toEqual(first);
    expect(cache.put(third)).toBe(true);

    expect(cache.get(first.id)).toEqual(first);
    expect(cache.get(second.id)).toBeUndefined();
    expect(cache.get(third.id)).toEqual(third);
    expect(cache.metrics()).toMatchObject({
      entries: 2,
      evictions: 1,
      pinnedEntries: 0,
    });
    expect(cache.metrics().bytes).toBeLessThanOrEqual(cache.metrics().maxBytes);
  });

  it("keeps scoped pins, bounds bytes, and exposes prefetch metrics", () => {
    const cache = new DeterministicContextVmPageCache(1024 * 1024);
    const first = page("d", 400_000);
    const second = page("e", 400_000);
    cache.put(first);
    cache.pin([first.id], "active-fault");
    expect(cache.put(second, { prefetch: true })).toBe(false);
    expect(cache.get(first.id)).toEqual(first);
    expect(cache.metrics()).toMatchObject({
      entries: 1,
      pinnedEntries: 1,
      prefetchLoads: 0,
    });
    cache.unpin([first.id], "active-fault");
    expect(cache.metrics().pinnedEntries).toBe(0);
    const prefetchCache = new DeterministicContextVmPageCache(1024 * 1024);
    expect(
      prefetchCache.put(page("f", 80_000), { prefetch: true }),
    ).toBe(true);
    expect(prefetchCache.metrics().prefetchLoads).toBe(1);
    expect(() => new DeterministicContextVmPageCache(512)).toThrow();
    expect(new DeterministicContextVmPageCache(0).put(first)).toBe(false);
  });
});
