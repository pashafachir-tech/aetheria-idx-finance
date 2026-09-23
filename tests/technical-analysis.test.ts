import { describe, expect, it } from "vitest";
import { buildTechnicalPrompt, computeDeterministicMarkers, fallbackTechnicalAnalysis, parseTechnicalAnalysis, type PriceSeries } from "../apps/web/lib/technical-analysis";
import { priceHistoryFor, supportedPriceHistoryTickers } from "../apps/web/lib/price-history";

const series: PriceSeries = {
  symbol: "TEST",
  currency: "IDR",
  points: [
    { date: "2026-09-01", close: 100, volume: 1000 },
    { date: "2026-09-02", close: 105, volume: 1200 },
    { date: "2026-09-03", close: 103, volume: 3000 },
    { date: "2026-09-04", close: 110, volume: 1500 },
    { date: "2026-09-05", close: 108, volume: 1400 },
  ],
};

describe("technical analysis", () => {
  it("builds a prompt with the JSON schema and CSV payload", () => {
    const prompt = buildTechnicalPrompt(series);
    expect(prompt).toContain('"chart_markers"');
    expect(prompt).toContain("2026-09-01,100,1000");
  });

  it("accepts a valid Gemini JSON payload and clamps marker prices to real closes", () => {
    const parsed = parseTechnicalAnalysis({ summary: { trend: "bullish", insight_text: "Tren menguat." }, chart_markers: [{ date: "2026-09-04", price: 500, type: "positive", label: "Breakout" }] }, series);
    expect(parsed).not.toBeNull();
    expect(parsed?.chart_markers[0]).toMatchObject({ date: "2026-09-04", price: 110, type: "positive" });
  });

  it("rejects invalid trend, empty insight, and unknown marker dates", () => {
    expect(parseTechnicalAnalysis({ summary: { trend: "moon", insight_text: "x" } }, series)).toBeNull();
    expect(parseTechnicalAnalysis({ summary: { trend: "bullish", insight_text: "" } }, series)).toBeNull();
    const parsed = parseTechnicalAnalysis({ summary: { trend: "sideways", insight_text: "ok" }, chart_markers: [{ date: "1999-01-01", price: 1, type: "positive", label: "ghost" }] }, series);
    expect(parsed?.chart_markers).toHaveLength(0);
  });

  it("computes deterministic fallback markers for volume spike, breakout, and correction", () => {
    const markers = computeDeterministicMarkers(series.points);
    expect(markers.some((marker) => marker.label.includes("Lonjakan volume"))).toBe(true);
    expect(markers.some((marker) => marker.label.includes("Penembusan resistance"))).toBe(true);
    expect(markers.every((marker) => ["positive", "negative", "neutral"].includes(marker.type))).toBe(true);

    const fallback = fallbackTechnicalAnalysis(series);
    expect(fallback.summary.trend).toBe("bullish");
    expect(fallback.summary.insight_text.length).toBeGreaterThan(0);
  });

  it("exposes bundled price history for AKRA and BBRI only", () => {
    expect(priceHistoryFor("akra")?.symbol).toBe("AKRA");
    expect(priceHistoryFor("BBRI")?.points.length).toBeGreaterThan(10);
    expect(priceHistoryFor("ZZZZ")).toBeNull();
    expect(supportedPriceHistoryTickers()).toEqual(["AKRA", "BBRI"]);
  });
});