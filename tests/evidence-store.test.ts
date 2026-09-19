import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileEvidenceCache } from "../packages/evidence-store/src/index.js";
import type { RawCacheEntry } from "../packages/domain/src/index.js";

const temporaryDirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "aetheria-evidence-"));
  temporaryDirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const entry: RawCacheEntry = {
  raw: { data: { symbol: "AKRA" } },
  evidence: { id: "sectors:getCompanyProfile:AKRA:2026-09-19T00:00:00.000Z", provider: "sectors", operation: "getCompanyProfile", retrievedAt: "2026-09-19T00:00:00.000Z", cacheStatus: "miss" },
};

describe("FileEvidenceCache", () => {
  it("persists and restores raw payloads with their evidence envelope across instances", async () => {
    const dir = await tempDir();
    await new FileEvidenceCache(dir).set("sectors:getCompanyProfile:AKRA", entry);

    await expect(new FileEvidenceCache(dir).get("sectors:getCompanyProfile:AKRA")).resolves.toEqual(entry);
  });

  it("returns undefined for unknown keys and treats corrupted files as misses", async () => {
    const dir = await tempDir();
    const cache = new FileEvidenceCache(dir);

    await expect(cache.get("sectors:getCompanyProfile:UNKNOWN")).resolves.toBeUndefined();
    await writeFile(path.join(dir, "corrupt.json"), "{not-json", "utf8");
    await expect(cache.get("corrupt")).resolves.toBeUndefined();
  });
});