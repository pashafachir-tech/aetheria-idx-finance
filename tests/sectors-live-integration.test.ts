import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSectorsAdapter, sectorsConfigFromEnv } from "../packages/sectors-adapter/src/index.js";
import { FileEvidenceCache } from "../packages/evidence-store/src/index.js";
import profile from "../fixtures/akra/company-profile.json";
import financials from "../fixtures/akra/financial-statements.json";
import type { DomainError } from "../packages/domain/src/index.js";

const temporaryDirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "aetheria-live-"));
  temporaryDirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const fixedNow = () => new Date("2026-09-19T10:00:00.000Z");

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("live Sectors runtime integration", () => {
  it("persists raw payloads and original evidence across cache restarts", async () => {
    const dir = await tempDir();
    const fetcher = vi.fn(async () => jsonResponse(profile)) as unknown as typeof fetch;
    const config = { baseUrl: "https://sectors.example.test", fetcher };

    const first = createSectorsAdapter({ mode: "live", config }, new FileEvidenceCache(dir), fixedNow);
    const firstResult = await first.getCompanyProfile("AKRA");

    const second = createSectorsAdapter({ mode: "live", config }, new FileEvidenceCache(dir), fixedNow);
    const secondResult = await second.getCompanyProfile("AKRA");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(secondResult.evidence).toMatchObject({ cacheStatus: "hit", id: firstResult.evidence.id, retrievedAt: firstResult.evidence.retrievedAt });
    expect(secondResult.data.ticker.value).toBe("AKRA");
  });

  it("sorts reversed financial statements and rejects duplicates from a live response", async () => {
    const dir = await tempDir();
    const fetcher = vi.fn(async () => jsonResponse({ data: [...financials.data].reverse() })) as unknown as typeof fetch;
    const adapter = createSectorsAdapter({ mode: "live", config: { baseUrl: "https://sectors.example.test", fetcher } }, new FileEvidenceCache(dir), fixedNow);

    const result = await adapter.getFinancialStatements("AKRA");
    expect(result.data.annual.map((statement) => statement.fiscalYear)).toEqual([2023, 2024]);

    const duplicateDir = await tempDir();
    const duplicateFetcher = vi.fn(async () => jsonResponse({ data: [financials.data[0], financials.data[0]] })) as unknown as typeof fetch;
    const duplicateAdapter = createSectorsAdapter({ mode: "live", config: { baseUrl: "https://sectors.example.test", fetcher: duplicateFetcher } }, new FileEvidenceCache(duplicateDir), fixedNow);
    await expect(duplicateAdapter.getFinancialStatements("AKRA")).rejects.toMatchObject({ code: "INVALID_PROVIDER_PAYLOAD" } satisfies Partial<DomainError>);
  });

  it("requires explicit env configuration before live mode can run", () => {
    try {
      sectorsConfigFromEnv({});
      expect.unreachable("Expected sectorsConfigFromEnv to throw");
    } catch (error) {
      expect(error).toMatchObject({ code: "PROVIDER_FAILURE" } satisfies Partial<DomainError>);
    }
  });
});