import { describe, expect, it } from "vitest";
import {
  SectorsAdapter,
  type RawResponseCache,
  type SectorsClient,
} from "../packages/sectors-adapter/src/index.js";

function memoryCache(): RawResponseCache {
  const values = new Map<string, unknown>();
  return { get: async (key) => values.get(key), set: async (key, value) => void values.set(key, value) };
}

function minimalClient(): SectorsClient {
  return {
    getCompanyProfile: async () => ({}),
    getFinancialStatements: async () => ({}),
    getDailyMarketData: async () => ({}),
    getSubsectorPeers: async () => ({}),
  };
}

describe("Sectors API v2 Official Endpoints & Quality Guards", () => {
  const adapter = new SectorsAdapter(minimalClient(), memoryCache());

  it("1. getIdxMarketSummary returns valid macro exchange metrics structure", async () => {
    const res = await adapter.getIdxMarketSummary();
    expect(res.data).toBeDefined();
    expect(typeof res.data.ihsg_index).toBe("number");
    expect(res.evidence.operation).toBe("getIdxMarketSummary");
  });

  it("2. getMostTradedStocks returns active BEI stocks list", async () => {
    const res = await adapter.getMostTradedStocks();
    expect(Array.isArray(res.data)).toBe(true);
  });

  it("3. getTopCompanyMovers returns gainers and losers structure", async () => {
    const res = await adapter.getTopCompanyMovers();
    expect(Array.isArray(res.data.gainers)).toBe(true);
    expect(Array.isArray(res.data.losers)).toBe(true);
  });

  it("4. getFreeFloatAnalysis correctly flags free float structure", async () => {
    const normal = await adapter.getFreeFloatAnalysis("BBCA");
    expect(typeof normal.data.free_float_pct).toBe("number");
    expect(normal.data.minimum_threshold_pct).toBe(7.5);
  });

  it("5. getCompanyQuarterlyFinancials evaluates seasonality structure", async () => {
    const clean = await adapter.getCompanyQuarterlyFinancials("BBCA");
    expect(Array.isArray(clean.data.quarterly_records)).toBe(true);
    expect(Array.isArray(clean.data.seasonality_matrix)).toBe(true);
    expect(clean.data.window_dressing_badge).toBeDefined();
  });

  it("6. getStockSuspensions detects clean record vs UMA/suspension penalty", async () => {
    const clean = await adapter.getStockSuspensions("BBCA");
    expect(clean.data.status).toBe("CLEAN TRADING RECORD");
    expect(clean.data.suspended_last_12m).toBe(false);
    expect(clean.data.score_penalty).toBe(0);
  });

  it("7. getCorporateActions returns actions structure", async () => {
    const res = await adapter.getCorporateActions("BBCA");
    expect(Array.isArray(res.data.actions)).toBe(true);
  });

  it("8. getShareholdersComposition parses shareholders structure", async () => {
    const res = await adapter.getShareholdersComposition("BBCA");
    expect(Array.isArray(res.data.controlling_shareholders)).toBe(true);
    expect(typeof res.data.foreign_pct).toBe("number");
  });

  it("9. getTopBuyersSellers audits broker accumulation vs distribution stance", async () => {
    const res = await adapter.getTopBuyersSellers("BBCA");
    expect(Array.isArray(res.data.top_buyers)).toBe(true);
    expect(Array.isArray(res.data.top_sellers)).toBe(true);
    expect(["BIG ACCUMULATION", "NEUTRAL", "DISTRIBUTION PRESSURE"]).toContain(res.data.dominance_status);
  });

  it("10. getCompanyFilings returns filings structure", async () => {
    const res = await adapter.getCompanyFilings("BBCA");
    expect(Array.isArray(res.data.filings)).toBe(true);
  });
});
