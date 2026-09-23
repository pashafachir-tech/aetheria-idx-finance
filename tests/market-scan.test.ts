import { describe, expect, it } from "vitest";
import { FEATURED_TICKERS, SECTOR_FILTERS, filterCatalysts, filterLeaders, screenCatalysts, screenCatalystsFor, screenLeaders, searchTickers, sectorLabel } from "../apps/web/lib/market-scan";

describe("market scan dataset", () => {
  it("exposes the six sector filters including the all-sectors chip", () => {
    expect(SECTOR_FILTERS.map((filter) => filter.key)).toEqual(["all", "energy", "financials", "infrastructure", "consumer", "industrials"]);
  });

  it("returns exactly five catalysts and five leaders for the full scan", () => {
    expect(filterCatalysts("all")).toHaveLength(5);
    expect(filterLeaders("all")).toHaveLength(5);
  });

  it("filters catalysts and leaders by sector deterministically", () => {
    const energyCatalysts = filterCatalysts("energy");
    expect(energyCatalysts.length).toBeGreaterThan(0);
    expect(energyCatalysts.every((catalyst) => catalyst.sector === "energy")).toBe(true);

    const financialLeaders = filterLeaders("financials");
    expect(financialLeaders.every((leader) => leader.sector === "financials")).toBe(true);
    expect(filterCatalysts("all")).toEqual(filterCatalysts("all"));
  });

  it("keeps catalysts free of external news links and backed by metrics", () => {
    for (const catalyst of filterCatalysts("all")) {
      expect(catalyst.why.length).toBeGreaterThan(0);
      expect(catalyst.metricValue.length).toBeGreaterThan(0);
      expect(JSON.stringify(catalyst)).not.toMatch(/https?:\/\//);
    }
  });

  it("includes AKRA in the featured quick picker and labels sectors", () => {
    expect(FEATURED_TICKERS.some((ticker) => ticker.ticker === "AKRA")).toBe(true);
    expect(sectorLabel("financials")).toContain("Finansial");
    expect(sectorLabel("all")).toContain("Semua");
  });

  it("screens catalysts and leaders deterministically by retail criteria", () => {
    const cashLeaders = screenLeaders("all", "cash");
    expect(cashLeaders.length).toBeGreaterThan(0);
    expect(cashLeaders.every((item) => item.cfoNi > 0.85)).toBe(true);

    const valueCatalysts = screenCatalysts("all", "value");
    expect(valueCatalysts.every((item) => item.fairValueAboveMarket)).toBe(true);

    const accrualLeaders = screenLeaders("all", "accrual");
    expect(accrualLeaders.every((item) => item.divergence >= 1.5)).toBe(true);

    expect(screenCatalysts("all", "all")).toHaveLength(5);
  });

  it("supports multi-sector screening and ticker/name search", () => {
    const multi = screenCatalystsFor(["energy", "financials"], "all");
    expect(multi.length).toBeGreaterThan(0);
    expect(multi.every((item) => item.sector === "energy" || item.sector === "financials")).toBe(true);

    expect(screenCatalystsFor(["all"], "all")).toHaveLength(5);

    expect(searchTickers("bbca").some((item) => item.ticker === "BBCA")).toBe(true);
    expect(searchTickers("mandiri").some((item) => item.ticker === "BMRI")).toBe(true);
    expect(searchTickers("")).toHaveLength(10);
  });
});