import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { RawResponseCache } from "../../domain/src/index";

export class FileEvidenceCache implements RawResponseCache {
  private readonly memoryCache = new Map<string, { value: unknown; timestamp: number }>();
  private readonly ttlMs = 7 * 24 * 60 * 60 * 1000; // 7-day TTL

  constructor(private readonly directory: string = defaultCacheDirectory()) {}

  async get(key: string): Promise<unknown | undefined> {
    const memory = this.memoryCache.get(key);
    if (memory && Date.now() - memory.timestamp < this.ttlMs) {
      return memory.value;
    }

    const file = this.filePath(key);
    try {
      const stats = await stat(file);
      if (Date.now() - stats.mtimeMs > this.ttlMs) {
        return undefined;
      }
      const data = JSON.parse(await readFile(file, "utf8")) as unknown;
      this.memoryCache.set(key, { value: data, timestamp: stats.mtimeMs });
      return data;
    } catch (error) {
      if (error instanceof SyntaxError || isNotFoundError(error)) {
        if (isNotFoundError(error)) {
          const fallback = this.legacyFilePath(key);
          if (fallback && existsSync(fallback)) {
            try {
              const legacyStats = await stat(fallback);
              if (Date.now() - legacyStats.mtimeMs <= this.ttlMs) {
                const legacyData = JSON.parse(await readFile(fallback, "utf8")) as unknown;
                await this.set(key, legacyData).catch(() => {});
                return legacyData;
              }
            } catch {
              // Ignore legacy read errors
            }
          }
        }
        return undefined;
      }
      throw error;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    this.memoryCache.set(key, { value, timestamp: Date.now() });
    await mkdir(this.directory, { recursive: true });
    const file = this.filePath(key);
    const content = JSON.stringify(value);
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;

    try {
      await writeFile(temp, content, "utf8");

      let renamed = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (existsSync(file)) {
            try {
              await unlink(file);
            } catch (_) {}
          }
          await rename(temp, file);
          renamed = true;
          break;
        } catch (err: any) {
          if (attempt === 2 || (err?.code !== "EPERM" && err?.code !== "EACCES")) throw err;
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
      }

      if (!renamed) {
        await writeFile(file, content, "utf8");
        try {
          if (existsSync(temp)) await unlink(temp);
        } catch (_) {}
      }
    } catch {
      await writeFile(file, content, "utf8");
      try {
        if (existsSync(temp)) await unlink(temp);
      } catch (_) {}
    }
  }

  private filePath(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "entry";
    return path.join(this.directory, `${safe}.json`);
  }

  private legacyFilePath(key: string): string | undefined {
    let current = this.directory;
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(current, "packages", "evidence-store", ".cache");
      if (existsSync(candidate)) {
        const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "entry";
        return path.join(candidate, `${safe}.json`);
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return undefined;
  }
}

export function defaultCacheDirectory(): string {
  const override = process.env.AETHERIA_EVIDENCE_CACHE_DIR?.trim();
  if (override) return path.resolve(override);

  let current = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml")) || existsSync(path.join(current, ".git"))) {
      return path.resolve(current, ".cache", "sectors");
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(process.cwd(), ".cache", "sectors");
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}