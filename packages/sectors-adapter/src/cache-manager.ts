/**
 * SWR Multi-Tier Cache Manager for Sectors API v2
 * Tier 1: In-Memory LRU Map — sub-millisecond response for hot tickers
 * Tier 2: Persistent Disk Cache (.cache/sectors/) — TTL-based with SWR support
 *
 * Design: When API returns 429/5xx, stale cache is served with `isStale: true`
 * flag, guaranteeing zero-downtime during hackathon demos.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Configuration ───────────────────────────────────────────────────────────

export interface SWRCacheConfig {
  /** Maximum entries in memory LRU. Default: 200 */
  memoryMaxEntries: number;
  /** TTL for daily candle / market data (ms). Default: 6h */
  dailyDataTtlMs: number;
  /** TTL for profile / segment / slow-changing data (ms). Default: 24h */
  profileDataTtlMs: number;
  /** How long stale data remains servable after TTL expiry (ms). Default: 72h */
  staleTtlMs: number;
  /** Root directory for disk cache. Default: .cache/sectors */
  diskCacheDir: string;
}

export const DEFAULT_SWR_CONFIG: SWRCacheConfig = {
  memoryMaxEntries: 200,
  dailyDataTtlMs: 6 * 60 * 60 * 1000,      // 6 hours
  profileDataTtlMs: 24 * 60 * 60 * 1000,    // 24 hours
  staleTtlMs: 72 * 60 * 60 * 1000,          // 72 hours
  diskCacheDir: ".cache/sectors",
};

// ─── Cache Entry Types ───────────────────────────────────────────────────────

export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttlMs: number;
  operation: string;
  key: string;
}

export interface CacheResult<T = unknown> {
  data: T;
  isStale: boolean;
  source: "memory" | "disk" | "miss";
  ageMs: number;
}

// ─── Retry Configuration ─────────────────────────────────────────────────────

export interface RetryConfig {
  /** Maximum number of retry attempts. Default: 3 */
  maxRetries: number;
  /** Base delay for exponential backoff (ms). Default: 300 */
  baseDelayMs: number;
  /** Maximum delay cap (ms). Default: 3000 */
  maxDelayMs: number;
  /** HTTP status codes that trigger retry. Default: [429, 502, 503] */
  retryableStatuses: number[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 300,
  maxDelayMs: 3000,
  retryableStatuses: [429, 502, 503],
};

// ─── Utility: Exponential Backoff with Jitter ────────────────────────────────

export function calculateBackoffDelay(attempt: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 100);
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

export function isRetryableStatus(status: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  return config.retryableStatuses.includes(status);
}

// ─── TTL Category Resolver ───────────────────────────────────────────────────

const DAILY_OPS = new Set([
  "daily-market-data",
  "most-traded",
  "top-company-movers",
  "idx-market-summary",
  "daily-net-foreign-inflow",
  "top-accum-dist",
  "top-buyers-sellers",
  "market-news",
]);

export function getTtlForOperation(operation: string, config: SWRCacheConfig = DEFAULT_SWR_CONFIG): number {
  return DAILY_OPS.has(operation) ? config.dailyDataTtlMs : config.profileDataTtlMs;
}

export function safeWriteJsonSync(targetPath: string, data: unknown): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = JSON.stringify(data, null, 2);
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;

  try {
    fs.writeFileSync(tmpPath, content, "utf-8");

    // Coba rename dengan retry 3x untuk mengatasi file-lock Windows
    let renamed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (fs.existsSync(targetPath)) {
          try {
            fs.unlinkSync(targetPath);
          } catch (_) {}
        }
        fs.renameSync(tmpPath, targetPath);
        renamed = true;
        break;
      } catch (err: any) {
        if (attempt === 2 || err.code !== "EPERM") throw err;
        // Tunggu 40ms sebelum retry
        const start = Date.now();
        while (Date.now() - start < 40) {}
      }
    }

    if (!renamed) {
      fs.writeFileSync(targetPath, content, "utf-8");
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch (_) {}
    }
  } catch (err) {
    // Fallback absolut jika rename ditolak: tulis langsung ke target file
    fs.writeFileSync(targetPath, content, "utf-8");
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {}
  }
}

// ─── SWR Cache Manager ──────────────────────────────────────────────────────

export class SWRCacheManager {
  private memory = new Map<string, CacheEntry>();
  private accessOrder: string[] = [];
  private config: SWRCacheConfig;

  constructor(config: Partial<SWRCacheConfig> = {}) {
    this.config = { ...DEFAULT_SWR_CONFIG, ...config };
    this.ensureDiskDir();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Get cached data. Checks memory first, then disk.
   * Returns `null` if no valid cache (fresh or stale) exists.
   */
  get<T = unknown>(key: string): CacheResult<T> | null {
    const now = Date.now();

    // Tier 1: Memory LRU
    const memEntry = this.memory.get(key);
    if (memEntry) {
      this.touchAccessOrder(key);
      const ageMs = now - memEntry.timestamp;
      const isStale = ageMs > memEntry.ttlMs;
      const isBeyondStale = ageMs > memEntry.ttlMs + this.config.staleTtlMs;

      if (!isBeyondStale) {
        return { data: memEntry.data as T, isStale, source: "memory", ageMs };
      }
      // Beyond stale threshold — evict from memory
      this.memory.delete(key);
    }

    // Tier 2: Disk Cache
    const diskEntry = this.readDisk<T>(key);
    if (diskEntry) {
      const ageMs = now - diskEntry.timestamp;
      const isStale = ageMs > diskEntry.ttlMs;
      const isBeyondStale = ageMs > diskEntry.ttlMs + this.config.staleTtlMs;

      if (!isBeyondStale) {
        // Promote to memory
        this.setMemory(key, diskEntry);
        return { data: diskEntry.data as T, isStale, source: "disk", ageMs };
      }
    }

    return null;
  }

  /**
   * Get only fresh (non-stale) data. Returns null if stale or missing.
   */
  getFresh<T = unknown>(key: string): CacheResult<T> | null {
    const result = this.get<T>(key);
    if (result && !result.isStale) return result;
    return null;
  }

  /**
   * Store data in both memory and disk tiers.
   */
  set<T = unknown>(key: string, data: T, operation: string, ttlMs?: number): void {
    const resolvedTtl = ttlMs ?? getTtlForOperation(operation, this.config);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttlMs: resolvedTtl,
      operation,
      key,
    };

    this.setMemory(key, entry);
    this.writeDisk(key, entry);
  }

  /**
   * Invalidate a specific key from both tiers.
   */
  invalidate(key: string): void {
    this.memory.delete(key);
    this.deleteDisk(key);
  }

  /**
   * Clear all cached data from both tiers.
   */
  clear(): void {
    this.memory.clear();
    this.accessOrder = [];
    this.clearDisk();
  }

  /**
   * Get current cache stats for telemetry.
   */
  stats(): { memorySize: number; memoryMaxEntries: number } {
    return {
      memorySize: this.memory.size,
      memoryMaxEntries: this.config.memoryMaxEntries,
    };
  }

  // ── Memory LRU Management ──────────────────────────────────────────────

  private setMemory<T>(key: string, entry: CacheEntry<T>): void {
    // Evict if at capacity
    while (this.memory.size >= this.config.memoryMaxEntries && this.accessOrder.length > 0) {
      const evictKey = this.accessOrder.shift()!;
      this.memory.delete(evictKey);
    }

    this.memory.set(key, entry as CacheEntry);
    this.touchAccessOrder(key);
  }

  private touchAccessOrder(key: string): void {
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.push(key);
  }

  // ── Disk Cache Management ─────────────────────────────────────────────

  private ensureDiskDir(): void {
    try {
      const dir = this.resolveDiskDir();
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
      // Non-fatal: disk cache is best-effort
    }
  }

  private resolveDiskDir(): string {
    if (path.isAbsolute(this.config.diskCacheDir)) {
      return this.config.diskCacheDir;
    }
    // Resolve relative to project root (walk up from this file)
    const projectRoot = path.resolve(__dirname, "../../../../");
    return path.join(projectRoot, this.config.diskCacheDir);
  }

  private diskFilePath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_:-]/g, "_");
    return path.join(this.resolveDiskDir(), `${safeKey}.json`);
  }

  private readDisk<T>(key: string): CacheEntry<T> | null {
    try {
      const filePath = this.diskFilePath(key);
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as CacheEntry<T>;
    } catch {
      return null;
    }
  }

  private writeDisk<T>(key: string, entry: CacheEntry<T>): void {
    try {
      const filePath = this.diskFilePath(key);
      safeWriteJsonSync(filePath, entry);
    } catch (err) {
      console.warn(`[SWR Cache] Disk write failed for ${key}:`, err);
    }
  }

  private deleteDisk(key: string): void {
    try {
      const filePath = this.diskFilePath(key);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // Non-fatal
    }
  }

  private clearDisk(): void {
    try {
      const dir = this.resolveDiskDir();
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          fs.unlinkSync(path.join(dir, file));
        }
      }
    } catch {
      // Non-fatal
    }
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

let _instance: SWRCacheManager | null = null;

export function getSWRCacheManager(config?: Partial<SWRCacheConfig>): SWRCacheManager {
  if (!_instance) {
    _instance = new SWRCacheManager(config);
  }
  return _instance;
}

export function resetSWRCacheManager(): void {
  _instance?.clear();
  _instance = null;
}
