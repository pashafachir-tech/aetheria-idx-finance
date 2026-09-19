import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RawResponseCache } from "../../domain/src/index";

export class FileEvidenceCache implements RawResponseCache {
  constructor(private readonly directory: string = defaultCacheDirectory()) {}

  async get(key: string): Promise<unknown | undefined> {
    const file = this.filePath(key);
    try {
      return JSON.parse(await readFile(file, "utf8")) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError || isNotFoundError(error)) return undefined;
      throw error;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const file = this.filePath(key);
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(value), "utf8");
    await rename(temp, file);
  }

  private filePath(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "entry";
    return path.join(this.directory, `${safe}.json`);
  }
}

export function defaultCacheDirectory(): string {
  const override = process.env.AETHERIA_EVIDENCE_CACHE_DIR?.trim();
  if (override) return path.resolve(override);
  return path.resolve(process.cwd(), "packages", "evidence-store", ".cache");
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}