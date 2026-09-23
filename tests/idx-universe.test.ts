import { describe, expect, it } from "vitest";
import {
  IDX_UNIVERSE,
  IDX_UNIVERSE_COUNT,
  getIdxTicker,
  searchIdxTickers,
} from "../apps/web/lib/idx-universe";

describe("IDX Universe Dataset & Instant Search Engine", () => {
  it("contains at least 900 active IDX listed issuers", () => {
    expect(IDX_UNIVERSE_COUNT).toBeGreaterThanOrEqual(900);
    expect(IDX_UNIVERSE.length).toBeGreaterThanOrEqual(900);
  });

  it("ensures every issuer has valid ticker format, company name, and sector", () => {
    const tickerSet = new Set<string>();
    for (const item of IDX_UNIVERSE) {
      expect(item.ticker).toMatch(/^[A-Z0-9]{3,6}$/);
      expect(item.name.trim().length).toBeGreaterThan(0);
      expect(item.sector.trim().length).toBeGreaterThan(0);
      tickerSet.add(item.ticker);
    }
    // Verify high uniqueness
    expect(tickerSet.size).toBe(IDX_UNIVERSE.length);
  });

  it("includes all major bellwether issuers across key sectors", () => {
    const requiredTickers = [
      "BBCA",
      "BBRI",
      "BMRI",
      "BBNI",
      "AKRA",
      "ADRO",
      "ASII",
      "TLKM",
      "ICBP",
      "UNVR",
      "GOTO",
      "KLBF",
      "BSDE",
      "ANTM",
    ];
    for (const t of requiredTickers) {
      const found = getIdxTicker(t);
      expect(found).toBeDefined();
      expect(found?.ticker).toBe(t);
    }
  });

  it("performs instant case-insensitive ticker search", () => {
    const resultsLower = searchIdxTickers("bbca");
    expect(resultsLower.length).toBeGreaterThan(0);
    expect(resultsLower[0].ticker).toBe("BBCA");

    const resultsPrefix = searchIdxTickers("bb", 10);
    expect(resultsPrefix.length).toBeGreaterThan(0);
    expect(resultsPrefix.some((i) => i.ticker === "BBCA")).toBe(true);
    expect(resultsPrefix.some((i) => i.ticker === "BBRI")).toBe(true);
  });

  it("performs instant issuer name search", () => {
    const resultsName = searchIdxTickers("Bank Mandiri");
    expect(resultsName.length).toBeGreaterThan(0);
    expect(resultsName.some((i) => i.ticker === "BMRI")).toBe(true);

    const resultsTelco = searchIdxTickers("Telkom");
    expect(resultsTelco.length).toBeGreaterThan(0);
    expect(resultsTelco.some((i) => i.ticker === "TLKM")).toBe(true);
  });

  it("returns empty array for empty or blank query", () => {
    expect(searchIdxTickers("")).toEqual([]);
    expect(searchIdxTickers("   ")).toEqual([]);
  });

  it("respects the limit argument", () => {
    const limit3 = searchIdxTickers("B", 3);
    expect(limit3.length).toBeLessThanOrEqual(3);
    const limit15 = searchIdxTickers("B", 15);
    expect(limit15.length).toBe(15);
  });

  it("resolves getIdxTicker case-insensitively and returns undefined for unknown ticker", () => {
    expect(getIdxTicker("bbri")?.name).toContain("Bank Rakyat Indonesia");
    expect(getIdxTicker("UNKNOWN_TICKER_XYZ")).toBeUndefined();
  });
});
