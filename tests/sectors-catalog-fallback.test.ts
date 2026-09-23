import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../packages/domain/src/index.js";
import {
  SectorsAdapter,
  IDX_UNIVERSE_CATALOG,
  getIdxUniverseCatalogItem,
  type SectorsClient,
  type RawResponseCache,
} from "../packages/sectors-adapter/src/index.js";

function memoryCache(): RawResponseCache {
  const values = new Map<string, unknown>();
  return { get: async (key) => values.get(key), set: async (key, value) => void values.set(key, value) };
}

describe("IDX Universe Catalog Fallback on 404 Upstream", () => {
  it("verifies IDX_UNIVERSE_CATALOG contains 902 issuers including BDMN", () => {
    expect(IDX_UNIVERSE_CATALOG.length).toBeGreaterThanOrEqual(900);
    const bdmn = getIdxUniverseCatalogItem("BDMN");
    expect(bdmn).toBeDefined();
    expect(bdmn?.ticker).toBe("BDMN");
    expect(bdmn?.name).toBe("Bank Danamon Indonesia Tbk");
    expect(bdmn?.sector).toBe("Financials");
  });

  it("recovers from HTTP 404 company-profile failure via internal catalog fallback", async () => {
    const client: SectorsClient = {
      getCompanyProfile: vi.fn().mockRejectedValue(
        new DomainError("PROVIDER_FAILURE", "Sectors company-profile responded with HTTP 404.", "Check the endpoint mapping.")
      ),
      getFinancialStatements: vi.fn().mockResolvedValue({}),
      getDailyMarketData: vi.fn().mockResolvedValue({}),
      getSubsectorPeers: vi.fn().mockResolvedValue({}),
    };

    const adapter = new SectorsAdapter(client, memoryCache());
    const result = await adapter.getCompanyProfile("BDMN");

    expect(result).toBeDefined();
    expect(result.data.ticker.value).toBe("BDMN");
    expect(result.data.name.value).toBe("Bank Danamon Indonesia Tbk");
    expect(result.data.sector.value).toBe("Financials");
    expect(result.data.subsector.value).toBe("Banks");
    expect(result.data.coverage).toBe("coming_next");
    expect(result.evidence.cacheStatus).toBe("hit");
    expect(result.toolCall.operation).toBe("getCompanyProfile");
  });

  it("normalizes ticker case and handles .JK suffix during catalog lookup", async () => {
    const item = getIdxUniverseCatalogItem("bdmn.jk");
    expect(item).toBeDefined();
    expect(item?.ticker).toBe("BDMN");
    expect(item?.sector).toBe("Financials");
  });

  it("propagates error for unknown tickers not found in catalog", async () => {
    const client: SectorsClient = {
      getCompanyProfile: vi.fn().mockRejectedValue(
        new DomainError("PROVIDER_FAILURE", "Sectors company-profile responded with HTTP 404.", "Check endpoint.")
      ),
      getFinancialStatements: vi.fn().mockResolvedValue({}),
      getDailyMarketData: vi.fn().mockResolvedValue({}),
      getSubsectorPeers: vi.fn().mockResolvedValue({}),
    };

    const adapter = new SectorsAdapter(client, memoryCache());
    await expect(adapter.getCompanyProfile("NONEXISTENT_XYZ")).rejects.toThrow("HTTP 404");
  });

  it("handles BDMN in SectorsResearchDataSource using Promise.allSettled even when peripheral endpoints 404", async () => {
    const { SectorsResearchDataSource } = await import("../apps/web/lib/research-service.js");
    const client: SectorsClient = {
      getCompanyProfile: vi.fn().mockRejectedValue(
        new DomainError("PROVIDER_FAILURE", "Sectors company-profile responded with HTTP 404.", "Check endpoint.")
      ),
      getFinancialStatements: vi.fn().mockResolvedValue({}),
      getDailyMarketData: vi.fn().mockResolvedValue({
        data: {
          symbol: "BDMN",
          as_of: "2026-09-23",
          last_price: 2800,
          shares_outstanding: 9_770_000_000,
          currency: "IDR",
        },
      }),
      getSubsectorPeers: vi.fn().mockResolvedValue({
        data: {
          subsector: "Banks",
          companies: [{ symbol: "BBCA", company_name: "Bank Central Asia Tbk", market_cap: 1200000000000000 }],
        },
      }),
      getFinancialMetrics: vi.fn().mockResolvedValue({
        data: {
          symbol: "BDMN",
          period_end: "2025-12-31",
          book_value_per_share: 4500,
          roe: 0.08,
          cost_of_equity: 0.10,
          dividend_per_share: 150,
          payout_ratio: 0.35,
          net_interest_margin: 0.068,
          non_performing_loan: 0.024,
        },
      }),
      // Other peripheral endpoints intentionally reject with 404
      getDailyNetForeignInflow: vi.fn().mockRejectedValue(new DomainError("PROVIDER_FAILURE", "404", "")),
      getCorporateActions: vi.fn().mockRejectedValue(new DomainError("PROVIDER_FAILURE", "404", "")),
      getShareholdersComposition: vi.fn().mockRejectedValue(new DomainError("PROVIDER_FAILURE", "404", "")),
      getCompanyQuarterlyFinancials: vi.fn().mockRejectedValue(new DomainError("PROVIDER_FAILURE", "404", "")),
      getStockSuspensions: vi.fn().mockRejectedValue(new DomainError("PROVIDER_FAILURE", "404", "")),
      getTopBuyersSellers: vi.fn().mockRejectedValue(new DomainError("PROVIDER_FAILURE", "404", "")),
      getSubsectorAggregatedReport: vi.fn().mockRejectedValue(new DomainError("PROVIDER_FAILURE", "404", "")),
    };

    const adapter = new SectorsAdapter(client, memoryCache());
    const dataSource = new SectorsResearchDataSource(adapter);

    const collected = await dataSource.load("BDMN");
    expect(collected).toBeDefined();
    expect(dataSource.companyName).toBe("Bank Danamon Indonesia Tbk");
    expect(dataSource.sector).toBe("Financials");
    expect(dataSource.subsector).toBe("Banks");
    expect(dataSource.marketPrice).toBe(2800);
    expect(dataSource.modelApplicability?.model).toBe("RESIDUAL_INCOME");
    expect(dataSource.residualIncomeInputs?.roe).toBe(0.08);
    expect(dataSource.residualIncomeInputs?.bookValuePerShare).toBe(4500);
  });
});

