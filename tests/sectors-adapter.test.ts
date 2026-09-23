import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../packages/domain/src/index.js";
import { SectorsAdapter, type RawResponseCache, type SectorsClient } from "../packages/sectors-adapter/src/index.js";
import profile from "../fixtures/akra/company-profile.json";
import financials from "../fixtures/akra/financial-statements.json";
import market from "../fixtures/akra/daily-market-data.json";
import peers from "../fixtures/akra/subsector-peers.json";

function memoryCache(): RawResponseCache {
  const values = new Map<string, unknown>();
  return { get: async (key) => values.get(key), set: async (key, value) => void values.set(key, value) };
}

function fixtureClient(): SectorsClient {
  return {
    getCompanyProfile: vi.fn().mockResolvedValue(profile),
    getFinancialStatements: vi.fn().mockResolvedValue(financials),
    getDailyMarketData: vi.fn().mockResolvedValue(market),
    getSubsectorPeers: vi.fn().mockResolvedValue(peers),
  };
}

describe("SectorsAdapter", () => {
  it("normalizes the AKRA profile and marks the non-financial issuer as supported", async () => {
    const adapter = new SectorsAdapter(fixtureClient(), memoryCache());
    const result = await adapter.getCompanyProfile("akra");

    expect(result.data).toMatchObject({ coverage: "supported" });
    expect(result.data.ticker.value).toBe("AKRA");
    expect(result.data.name.value).toBe("PT AKR Corporindo Tbk");
    expect(result.evidence).toMatchObject({ provider: "sectors", operation: "getCompanyProfile", cacheStatus: "miss" });
    expect(result.data.sector.evidence.sourceField).toBe("data.sector");
    expect(result.toolCall).toMatchObject({ operation: "getCompanyProfile", cacheStatus: "MISS" });
  });

  it("preserves financial source currency, period, and numeric precision", async () => {
    const adapter = new SectorsAdapter(fixtureClient(), memoryCache());
    const result = await adapter.getFinancialStatements("AKRA");
    const latest = result.data.annual[1];

    expect(latest.periodEnd).toBe("2024-12-31");
    expect(latest.revenue).toMatchObject({ value: 46750000000750, sourceCurrency: "IDR", periodEnd: "2024-12-31", originalPrecision: 0 });
    expect(latest.operatingCashFlow.evidence.reportingPeriod).toBe("2024-12-31");
  });

  it("uses the raw-response cache for an identical request", async () => {
    const client = fixtureClient();
    const adapter = new SectorsAdapter(client, memoryCache());

    await adapter.getDailyMarketData("AKRA");
    const cached = await adapter.getDailyMarketData("AKRA");

    expect(client.getDailyMarketData).toHaveBeenCalledTimes(1);
    expect(cached.evidence.cacheStatus).toBe("hit");
    expect(cached.toolCall.cacheStatus).toBe("HIT");
    expect(cached.data.lastPrice.value).toBe(1525.5);
  });

  it("maps AKRA peers with provenance", async () => {
    const adapter = new SectorsAdapter(fixtureClient(), memoryCache());
    const result = await adapter.getSubsectorPeers("AKRA");

    expect(result.data.subsector).toBe("Oil, Gas & Coal");
    expect(result.data.companies[1].ticker.value).toBe("PGAS");
    expect(result.data.companies[0].marketCapitalization.evidence.provider).toBe("sectors");
  });

  it("maps bank metrics for financial-sector issuers", async () => {
    const client = fixtureClient();
    client.getFinancialMetrics = vi.fn().mockResolvedValue({
      data: { symbol: "BBRI", period_end: "2024-12-31", book_value_per_share: 2400, roe: 0.18, cost_of_equity: 0.1, dividend_per_share: 300, payout_ratio: 0.6, net_interest_margin: 0.075, non_performing_loan: 0.028 },
    });
    const adapter = new SectorsAdapter(client, memoryCache());
    const result = await adapter.getFinancialMetrics("BBRI");

    expect(result.data.bookValuePerShare.value).toBe(2400);
    expect(result.data.roe.value).toBeCloseTo(0.18, 6);
    expect(result.data.netInterestMargin.value).toBeCloseTo(0.075, 6);
    expect(result.data.nonPerformingLoan.value).toBeCloseTo(0.028, 6);
    expect(result.toolCall).toMatchObject({ operation: "getFinancialMetrics", cacheStatus: "MISS" });
  });

  it("rejects missing financial fields instead of replacing them with zero", async () => {
    const client = fixtureClient();
    client.getFinancialStatements = vi.fn().mockResolvedValue({ data: [{ ...financials.data[0], revenue: null }] });
    const adapter = new SectorsAdapter(client, memoryCache());

    await expect(adapter.getFinancialStatements("AKRA")).rejects.toMatchObject({ code: "INCOMPLETE_DATA" } satisfies Partial<DomainError>);
  });

  it("rejects an invalid provider payload with analyst recovery guidance", async () => {
    const client = fixtureClient();
    client.getCompanyProfile = vi.fn().mockResolvedValue(null);
    const adapter = new SectorsAdapter(client, memoryCache());

    await expect(adapter.getCompanyProfile("AKRA")).rejects.toMatchObject({
      code: "INCOMPLETE_DATA",
      recovery: "Refresh the data source or select an issuer with complete reported data.",
    } satisfies Partial<DomainError>);
  });

  it("rejects a provider payload whose symbol does not match the requested ticker", async () => {
    const client = fixtureClient();
    client.getCompanyProfile = vi.fn().mockResolvedValue({ data: { ...profile.data, symbol: "UNVR" } });
    const adapter = new SectorsAdapter(client, memoryCache());

    await expect(adapter.getCompanyProfile("AKRA")).rejects.toMatchObject({ code: "INVALID_PROVIDER_PAYLOAD" } satisfies Partial<DomainError>);
  });

  it("keeps the original EvidenceRef id and retrievedAt on cache hits", async () => {
    const client = fixtureClient();
    const adapter = new SectorsAdapter(client, memoryCache(), () => new Date("2026-09-19T10:00:00.000Z"));

    const first = await adapter.getCompanyProfile("AKRA");
    const second = await adapter.getCompanyProfile("AKRA");

    expect(second.evidence.cacheStatus).toBe("hit");
    expect(second.evidence.id).toBe(first.evidence.id);
    expect(second.evidence.retrievedAt).toBe(first.evidence.retrievedAt);
    expect(second.data.ticker.evidence.retrievedAt).toBe(first.data.ticker.evidence.retrievedAt);
  });

  it("sorts financial statements ascending by periodEnd", async () => {
    const client = fixtureClient();
    client.getFinancialStatements = vi.fn().mockResolvedValue({ data: [...financials.data].reverse() });
    const adapter = new SectorsAdapter(client, memoryCache());

    const result = await adapter.getFinancialStatements("AKRA");

    expect(result.data.annual.map((statement) => statement.fiscalYear)).toEqual([2023, 2024]);
  });

  it("rejects duplicate and malformed reporting periods", async () => {
    const duplicated = fixtureClient();
    duplicated.getFinancialStatements = vi.fn().mockResolvedValue({ data: [financials.data[0], { ...financials.data[0] }] });
    const adapter = new SectorsAdapter(duplicated, memoryCache());
    await expect(adapter.getFinancialStatements("AKRA")).rejects.toMatchObject({ code: "INVALID_PROVIDER_PAYLOAD" } satisfies Partial<DomainError>);

    const malformed = fixtureClient();
    malformed.getFinancialStatements = vi.fn().mockResolvedValue({ data: [{ ...financials.data[0], period_end: "31-12-2024" }] });
    const malformedAdapter = new SectorsAdapter(malformed, memoryCache());
    await expect(malformedAdapter.getFinancialStatements("AKRA")).rejects.toMatchObject({ code: "INVALID_PROVIDER_PAYLOAD" } satisfies Partial<DomainError>);
  });
});
