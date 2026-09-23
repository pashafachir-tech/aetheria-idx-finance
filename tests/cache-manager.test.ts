/**
 * SWR Cache Manager Unit Tests
 * Tests Memory LRU (Tier 1), Disk Persistence (Tier 2), TTL, and Stale-While-Revalidate.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SWRCacheManager,
  DEFAULT_SWR_CONFIG,
  getTtlForOperation,
  calculateBackoffDelay,
  isRetryableStatus,
  DEFAULT_RETRY_CONFIG,
  type SWRCacheConfig,
} from "../packages/sectors-adapter/src/cache-manager";

describe("SWR Cache Manager", () => {
  let cache: SWRCacheManager;

  beforeEach(() => {
    // Use a temp dir to avoid polluting project cache
    cache = new SWRCacheManager({
      memoryMaxEntries: 5,
      diskCacheDir: ".cache/sectors-test",
      dailyDataTtlMs: 1000,     // 1s for fast tests
      profileDataTtlMs: 2000,   // 2s for fast tests
      staleTtlMs: 5000,         // 5s stale window
    });
  });

  afterEach(() => {
    cache.clear();
  });

  it("should return null for cache miss", () => {
    const result = cache.get("nonexistent_key");
    expect(result).toBeNull();
  });

  it("should store and retrieve data from memory (Tier 1)", () => {
    cache.set("test_key", { price: 6225 }, "daily-market-data");
    const result = cache.get<{ price: number }>("test_key");
    expect(result).not.toBeNull();
    expect(result!.data.price).toBe(6225);
    expect(result!.isStale).toBe(false);
    expect(result!.source).toBe("memory");
  });

  it("should track cache stats correctly", () => {
    cache.set("key1", "data1", "daily-market-data");
    cache.set("key2", "data2", "company-profile");
    const stats = cache.stats();
    expect(stats.memorySize).toBe(2);
    expect(stats.memoryMaxEntries).toBe(5);
  });

  it("should evict LRU entries when memory is full", () => {
    // Fill cache to capacity (5 entries)
    for (let i = 0; i < 5; i++) {
      cache.set(`key_${i}`, `data_${i}`, "daily-market-data");
    }
    expect(cache.stats().memorySize).toBe(5);

    // Add one more — should evict the oldest (key_0)
    cache.set("key_5", "data_5", "daily-market-data");
    expect(cache.stats().memorySize).toBe(5);

    // key_0 should be evicted from memory (may still be on disk)
    const result = cache.get("key_0");
    // It should be found on disk (Tier 2)
    if (result) {
      expect(result.source).toBe("disk");
    }
  });

  it("should invalidate specific key from both tiers", () => {
    cache.set("to_delete", { x: 1 }, "daily-market-data");
    expect(cache.get("to_delete")).not.toBeNull();

    cache.invalidate("to_delete");
    expect(cache.get("to_delete")).toBeNull();
  });

  it("should clear all cached data", () => {
    cache.set("k1", "d1", "daily-market-data");
    cache.set("k2", "d2", "company-profile");
    cache.clear();
    expect(cache.stats().memorySize).toBe(0);
    expect(cache.get("k1")).toBeNull();
    expect(cache.get("k2")).toBeNull();
  });

  it("should return fresh result for getFresh when not expired", () => {
    cache.set("fresh_key", 42, "daily-market-data");
    const result = cache.getFresh<number>("fresh_key");
    expect(result).not.toBeNull();
    expect(result!.data).toBe(42);
    expect(result!.isStale).toBe(false);
  });

  it("should mark data as stale after TTL expiry", async () => {
    cache.set("stale_key", "value", "daily-market-data", 50); // 50ms TTL
    await new Promise((r) => setTimeout(r, 100)); // Wait for TTL to expire
    const result = cache.get("stale_key");
    expect(result).not.toBeNull();
    expect(result!.isStale).toBe(true);
  });

  it("should return null from getFresh after TTL expiry", async () => {
    cache.set("expire_key", "value", "daily-market-data", 50); // 50ms TTL
    await new Promise((r) => setTimeout(r, 100));
    const result = cache.getFresh("expire_key");
    expect(result).toBeNull();
  });
});

describe("TTL Category Resolver", () => {
  it("should return dailyDataTtlMs for daily operations", () => {
    const ttl = getTtlForOperation("daily-market-data");
    expect(ttl).toBe(DEFAULT_SWR_CONFIG.dailyDataTtlMs);
  });

  it("should return dailyDataTtlMs for most-traded", () => {
    const ttl = getTtlForOperation("most-traded");
    expect(ttl).toBe(DEFAULT_SWR_CONFIG.dailyDataTtlMs);
  });

  it("should return profileDataTtlMs for company profiles", () => {
    const ttl = getTtlForOperation("company-profile");
    expect(ttl).toBe(DEFAULT_SWR_CONFIG.profileDataTtlMs);
  });

  it("should return profileDataTtlMs for revenue-segments", () => {
    const ttl = getTtlForOperation("company-revenue-segments");
    expect(ttl).toBe(DEFAULT_SWR_CONFIG.profileDataTtlMs);
  });

  it("should return dailyDataTtlMs for top-buyers-sellers", () => {
    const ttl = getTtlForOperation("top-buyers-sellers");
    expect(ttl).toBe(DEFAULT_SWR_CONFIG.dailyDataTtlMs);
  });
});

describe("Exponential Backoff", () => {
  it("should calculate increasing delays for successive attempts", () => {
    const d0 = calculateBackoffDelay(0, { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 300, maxDelayMs: 5000, maxRetries: 3, retryableStatuses: [429] });
    const d1 = calculateBackoffDelay(1, { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 300, maxDelayMs: 5000, maxRetries: 3, retryableStatuses: [429] });
    const d2 = calculateBackoffDelay(2, { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 300, maxDelayMs: 5000, maxRetries: 3, retryableStatuses: [429] });

    // d0 should be ~300 + jitter, d1 ~600 + jitter, d2 ~1200 + jitter
    expect(d0).toBeGreaterThanOrEqual(300);
    expect(d0).toBeLessThan(500);
    expect(d1).toBeGreaterThanOrEqual(600);
    expect(d1).toBeLessThan(800);
    expect(d2).toBeGreaterThanOrEqual(1200);
    expect(d2).toBeLessThan(1400);
  });

  it("should cap delay at maxDelayMs", () => {
    const delay = calculateBackoffDelay(10, { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 300, maxDelayMs: 3000, maxRetries: 3, retryableStatuses: [] });
    expect(delay).toBeLessThanOrEqual(3100); // 3000 + max jitter 100
  });

  it("should identify retryable HTTP status codes", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});
