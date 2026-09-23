import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calculateEMA,
  calculateRSI,
  calculateStochastic,
  evaluateTechnicalSetups,
  getMorningMarketIntelligence,
  fetchOrLoadAggregateMarketSummary,
  resolveAggregateSummaryCachePath,
  formatTurnoverRp,
  type DailyCandle,
} from "../apps/web/lib/market-intelligence";

describe("Quantitative Technical Indicators & Morning Intelligence", () => {
  it("calculates EMA with mathematically sound exponential smoothing", () => {
    const prices = [100, 102, 104, 103, 105, 107, 106, 108, 110, 112];
    const ema5 = calculateEMA(prices, 5);

    expect(ema5).toHaveLength(prices.length);
    // Last EMA should be close to recent prices and reflect upward trend
    expect(ema5.at(-1)!).toBeGreaterThan(105);
    expect(ema5.at(-1)!).toBeLessThanOrEqual(112);
  });

  it("calculates RSI(14) with bounded output between 0 and 100", () => {
    // Generate synthetic series with heavy downtrend to trigger oversold
    const downtrendCloses: number[] = [];
    let price = 10000;
    for (let i = 0; i < 30; i++) {
      price -= 120;
      downtrendCloses.push(price);
    }

    const rsi = calculateRSI(downtrendCloses, 14);
    expect(rsi).toHaveLength(downtrendCloses.length);
    const lastRsi = rsi.at(-1)!;
    expect(lastRsi).toBeLessThan(35); // Should detect oversold
    expect(lastRsi).toBeGreaterThanOrEqual(0);
  });

  it("calculates Stochastic Oscillator %K and %D accurately", () => {
    const highs = [105, 106, 107, 105, 104, 103, 102, 101, 100, 102, 103, 104, 105, 106, 107];
    const lows =  [100, 101, 102, 100,  99,  98,  97,  96,  95,  96,  97,  98,  99, 100, 101];
    const closes =[104, 105, 106, 102, 100,  99,  98,  97,  96,  98, 100, 102, 103, 105, 106];

    const stoch = calculateStochastic(highs, lows, closes, 14, 3);
    expect(stoch.k).toHaveLength(closes.length);
    expect(stoch.d).toHaveLength(closes.length);

    // Bounded 0 - 100
    stoch.k.forEach((val) => {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    });
  });

  it("evaluates technical setups including support test and stochastic cross", () => {
    // Construct candles that test horizontal support and bounce
    const candles: DailyCandle[] = [];
    const now = new Date();
    for (let i = 25; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      // Support formed at 6775
      const close = i <= 2 ? 6800 : 7000 + i * 20;
      const low = i <= 2 ? 6775 : 6950;
      candles.push({
        date: d.toISOString().slice(0, 10),
        open: close + 10,
        high: close + 50,
        low,
        close,
        volume: 5000000,
      });
    }

    const setups = evaluateTechnicalSetups(candles);
    expect(setups.lastPrice).toBe(6800);
    expect(setups.support20).toBe(6775);
    expect(setups.activeSignals.length).toBeGreaterThan(0);
  });

  it("generates structured morning market intelligence with persistent cache", async () => {
    const data = await getMorningMarketIntelligence(true);

    expect(data).toBeDefined();
    expect(data.totalUniverseScanned).toBe(902);
    expect(data.catalysts.length).toBeGreaterThanOrEqual(3);
    expect(data.leaders.length).toBeGreaterThanOrEqual(5);
    expect(data.macroSummary).toBeTruthy();

    // Verify each catalyst structure
    for (const catalyst of data.catalysts) {
      expect(catalyst.id).toBeTruthy();
      expect(catalyst.title).toBeTruthy();
      expect(catalyst.primaryTicker).toBeTruthy();
      expect(catalyst.affectedTickers.length).toBeGreaterThan(0);
      expect(catalyst.technicalSetup.signals.length).toBeGreaterThan(0);
    }

    // Verify leaders structure
    for (const leader of data.leaders) {
      expect(leader.ticker).toBeTruthy();
      expect(leader.lastPrice).toBeGreaterThan(0);
      expect(leader.rsi).toBeGreaterThanOrEqual(0);
      expect(leader.bias).toBeTruthy();
    }
  });

  it("persists aggregate market summary to disk with 6h TTL", async () => {
    const summary = await fetchOrLoadAggregateMarketSummary(true);
    expect(summary).toBeDefined();
    expect(summary.ttlHours).toBe(6);
    expect(summary.mostTraded.length).toBeGreaterThanOrEqual(10);
    expect(summary.topCompanyMovers.gainers.length).toBeGreaterThan(0);
    expect(summary.topCompanyMovers.losers.length).toBeGreaterThan(0);
    expect(summary.marketNews.length).toBeGreaterThan(0);

    const cachePath = resolveAggregateSummaryCachePath();
    expect(fs.existsSync(cachePath)).toBe(true);

    expect(formatTurnoverRp(1_235_000_000_000)).toBe("Rp 1.24 T");
    expect(formatTurnoverRp(656_000_000_000)).toBe("Rp 656.0 M");
    expect(formatTurnoverRp(45_000_000)).toBe("Rp 45 Jt");
  });
});
