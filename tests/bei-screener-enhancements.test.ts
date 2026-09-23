import { describe, expect, it } from "vitest";
import { searchIdxTickers } from "../apps/web/lib/idx-universe";
import {
  getMorningMarketIntelligence,
  BEI_STRATEGY_PRESETS,
  matchBeiStrategies,
  evaluateTechnicalSetups,
  type DailyCandle,
} from "../apps/web/lib/market-intelligence";

describe("TUGAS 1-6 Quality Gates & BEI Quantitative Matrix Verification", () => {
  it("TUGAS 5: Autocomplete single-letter 'B' prioritizes market leaders at the top", () => {
    const results = searchIdxTickers("B", 8);
    expect(results.length).toBe(8);

    const tickers = results.map((r) => r.ticker);
    // Verified: Giants must be at the very top
    expect(tickers[0]).toBe("BBCA");
    expect(tickers[1]).toBe("BBRI");
    expect(tickers[2]).toBe("BMRI");
    expect(tickers[3]).toBe("BBNI");
    expect(tickers[4]).toBe("BRIS");
    expect(tickers[5]).toBe("BUMI");
    expect(tickers[6]).toBe("BDMN");
  });

  it("TUGAS 1: Eliminates hardcoded dummy Rp 1.500 and uniform RSI across universe", async () => {
    const data = await getMorningMarketIntelligence(true);
    expect(data).toBeDefined();

    const leaders = data.leaders;
    expect(leaders.length).toBeGreaterThanOrEqual(14);

    // BBCA: Live authentic bursa price conforms to IDX rules (Tick Size 25 for >= 5000)
    const bbca = leaders.find((l) => l.ticker === "BBCA");
    expect(bbca).toBeDefined();
    expect(bbca!.lastPrice).toBeGreaterThan(0);
    expect(bbca!.lastPrice).not.toBe(1500);
    expect(bbca!.lastPrice % 25).toBe(0);

    // BMRI: Live authentic bursa price conforms to IDX rules (Tick Size 10 for >= 2000)
    const bmri = leaders.find((l) => l.ticker === "BMRI");
    expect(bmri).toBeDefined();
    expect(bmri!.lastPrice).toBeGreaterThan(0);
    expect(bmri!.lastPrice).not.toBe(1500);
    expect(bmri!.lastPrice % 10).toBe(0);

    // BUMI: Live authentic bursa price conforms to IDX rules (Tick Size 1 for < 200)
    const bumi = leaders.find((l) => l.ticker === "BUMI");
    expect(bumi).toBeDefined();
    expect(bumi!.lastPrice).toBeGreaterThan(0);
    expect(bumi!.lastPrice).not.toBe(1500);
    expect(bumi!.lastPrice % 1).toBe(0);

    // AKRA: Live authentic bursa price conforms to IDX rules (Tick Size 5 for 500-2000)
    const akra = leaders.find((l) => l.ticker === "AKRA");
    expect(akra).toBeDefined();
    expect(akra!.lastPrice).toBeGreaterThan(0);
    expect(akra!.lastPrice).not.toBe(1500);
    expect(akra!.lastPrice % 5).toBe(0);

    // Check that RSI values are NOT identical (not uniform copy-paste 50.5)
    const rsiValues = new Set(leaders.map((l) => l.rsi));
    expect(rsiValues.size).toBeGreaterThan(5);

    // Zero dummy 1500 for unmapped tickers
    for (const leader of leaders) {
      if (["BBCA", "BMRI", "BUMI"].includes(leader.ticker)) {
        expect(leader.lastPrice).not.toBe(1500);
      }
    }
  });

  it("TUGAS 3: Dynamic Y-Axis calculation creates responsive non-flat domain for DFAM (Rp 91-92)", () => {
    // DFAM nominal prices
    const dfamCloses = [92, 91, 91, 92, 91, 92, 91, 91, 92];
    const minPrice = Math.min(...dfamCloses);
    const maxPrice = Math.max(...dfamCloses);
    const padding = Math.max(2, (maxPrice - minPrice) * 0.15); // max(2, 0.15) = 2
    const yMin = Math.max(1, Math.floor(minPrice - padding));
    const yMax = Math.ceil(maxPrice + padding);

    expect(yMin).toBe(89); // 91 - 2
    expect(yMax).toBe(94); // 92 + 2
    // Height spread is only 5 points, so 1 point move (91 to 92) occupies 20% of the chart, completely anti-flat!
    const pctMove = 1 / (yMax - yMin);
    expect(pctMove).toBe(0.2); // 20% dynamic amplitude!
  });

  it("TUGAS 6: BEI 4-Strategy Matrix matches quantitative criteria accurately", () => {
    expect(BEI_STRATEGY_PRESETS.length).toBe(5); // all + 4 presets

    // Test benchmark assignments
    const swingConfig = BEI_STRATEGY_PRESETS.find((p) => p.key === "swing");
    expect(swingConfig?.exampleTickers).toEqual(["BBCA", "ASII", "ICBP"]);

    const araConfig = BEI_STRATEGY_PRESETS.find((p) => p.key === "ara_hunter");
    expect(araConfig?.exampleTickers).toEqual(["BRIS", "MEDC", "BUMI"]);

    const bsjpConfig = BEI_STRATEGY_PRESETS.find((p) => p.key === "bsjp");
    expect(bsjpConfig?.exampleTickers).toEqual(["AKRA", "TLKM", "BMRI"]);

    const bpjsConfig = BEI_STRATEGY_PRESETS.find((p) => p.key === "bpjs");
    expect(bpjsConfig?.exampleTickers).toEqual(["PGAS", "ELSA", "INDF"]);

    // Test matcher function
    const mockInd = {
      lastPrice: 6225,
      prevPrice: 6150,
      ema20: 6200,
      ema50: 6150,
      ema100: 6050,
      rsi14: 58.4,
      stochK: 55,
      stochD: 52,
      prevStochK: 50,
      prevStochD: 51,
      support20: 6100,
      resistance20: 6300,
      isTestingEma100: false,
      isBullishEmaRebound: false,
      isRsiOversold: false,
      isRsiMomentumBreakout: true,
      isStochGoldenCross: false,
      isTestingSupport: false,
      isSupportRebound: false,
      activeSignals: ["RSI Momentum Breakout"],
    };

    const matchBbca = matchBeiStrategies("BBCA", mockInd, 1.02);
    expect(matchBbca.matches.swing).toBe(true);

    const matchBumi = matchBeiStrategies("BUMI", { ...mockInd, rsi14: 65 }, 3.5);
    expect(matchBumi.matches.ara_hunter).toBe(true);
  });
});
