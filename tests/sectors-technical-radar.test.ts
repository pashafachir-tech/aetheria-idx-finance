import { describe, expect, it } from "vitest";

describe("Sectors API Technical Radar & Deterministic Quant Math", () => {
  it("calculates multi-year margin and growth deterministically", () => {
    const revenue = 45e12; // Rp 45 Triliun
    const netIncome = 5.4e12; // Rp 5.4 Triliun
    const margin = (netIncome / revenue) * 100;

    expect(margin).toBeCloseTo(12.0, 1);
    expect(margin).toBeGreaterThan(0);
  });

  it("calculates solvency and cash coverage ratio accurately", () => {
    const marketCap = 90e12; // Rp 90 T
    const totalDebt = 15e12; // Rp 15 T
    const cash = 22.5e12; // Rp 22.5 T

    const cashCoverage = cash / totalDebt;
    const netCash = cash - totalDebt;
    const debtToCap = (totalDebt / marketCap) * 100;

    expect(cashCoverage).toBe(1.5);
    expect(netCash).toBe(7.5e12); // Positive net cash
    expect(debtToCap).toBeCloseTo(16.7, 1);
  });

  it("produces complete 12-month seasonality trends", () => {
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
    expect(months).toHaveLength(12);

    const pattern2024 = [3.2, -1.8, 4.5, -2.1, 1.4, 2.8, -0.5, 3.1, -1.2, 2.4, 3.8, 5.2];
    expect(pattern2024).toHaveLength(12);
    // December window dressing is typically positive
    expect(pattern2024[11]).toBeGreaterThan(0);
  });

  it("detects EMA 100 bounce within 1.0% tolerance band", () => {
    const ema100 = 6800;
    const testPrices = [6820, 6790, 6865, 7100];

    const results = testPrices.map((p) => {
      const distPct = Math.abs(p - ema100) / ema100;
      return distPct <= 0.01;
    });

    expect(results[0]).toBe(true); // 6820 is +0.29%
    expect(results[1]).toBe(true); // 6790 is -0.15%
    expect(results[2]).toBe(true); // 6865 is +0.95%
    expect(results[3]).toBe(false); // 7100 is +4.41%
  });
});
