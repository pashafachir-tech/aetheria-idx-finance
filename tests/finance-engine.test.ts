import { describe, expect, it } from "vitest";
import {
  applyFcffHaircut,
  buildCashFlowBridge,
  buildValuationSensitivity,
  calculateDcf,
  calculateFcff,
  calculateReverseDcf,
  computeEarningsQualityScorecard,
  DEFAULT_QUALITY_THRESHOLDS,
  evaluateCfoToNi,
  evaluateReceivablesDivergence,
  qualityThresholdsForSector,
  validateForensicPeriods,
} from "../packages/finance-engine/src/index.js";

const normalPeriods = [
  { periodEnd: "2023-12-31", netIncome: 100, operatingCashFlow: 90, revenue: 1_000, accountsReceivable: 100 },
  { periodEnd: "2024-12-31", netIncome: 120, operatingCashFlow: 108, revenue: 1_100, accountsReceivable: 110 },
];

const dcfInput = {
  forecastFcff: [100, 100, 100, 100, 100],
  wacc: 0.1,
  terminalGrowth: 0.03,
  cash: 50,
  totalDebt: 20,
  minorityInterest: 0,
  sharesOutstanding: 10,
};

describe("finance engine", () => {
  it("evaluates normal CFO-to-NI and receivables periods without a signal", () => {
    expect(evaluateCfoToNi(normalPeriods)).toMatchObject({ status: "clear", threshold: 0.7 });
    expect(evaluateReceivablesDivergence(normalPeriods)).toMatchObject({ status: "clear", ratio: 1 });
  });

  it("flags two consecutive low CFO-to-NI ratios and receivables divergence", () => {
    const periods = [
      { periodEnd: "2023-12-31", netIncome: 100, operatingCashFlow: 60, revenue: 1_000, accountsReceivable: 100 },
      { periodEnd: "2024-12-31", netIncome: 120, operatingCashFlow: 60, revenue: 1_100, accountsReceivable: 130 },
    ];

    expect(evaluateCfoToNi(periods)).toMatchObject({ status: "flagged" });
    expect(evaluateReceivablesDivergence(periods)).toMatchObject({ status: "flagged" });
  });

  it("suppresses receivables divergence when revenue growth is near zero", () => {
    expect(evaluateReceivablesDivergence([
      { periodEnd: "2023-12-31", revenue: 1_000, accountsReceivable: 100 },
      { periodEnd: "2024-12-31", revenue: 1_005, accountsReceivable: 130 },
    ])).toMatchObject({ status: "not_evaluable" });
  });

  it("returns incomplete data instead of substituting missing inputs", () => {
    expect(validateForensicPeriods([{ periodEnd: "2024-12-31", netIncome: 100, operatingCashFlow: null }])).toMatchObject({
      status: "incomplete_data",
      missing: expect.arrayContaining(["2024-12-31.operatingCashFlow"]),
    });
    expect(calculateFcff({ ebit: 100, taxRate: 0.22 })).toEqual({
      status: "incomplete_data",
      missing: ["depreciationAndAmortization", "capitalExpenditure", "changeInNwc"],
    });
  });

  it("does not evaluate CFO-to-NI when net income is negative", () => {
    const result = evaluateCfoToNi([
      { periodEnd: "2023-12-31", netIncome: -100, operatingCashFlow: 50 },
      { periodEnd: "2024-12-31", netIncome: -50, operatingCashFlow: 40 },
    ]);

    expect(result).toMatchObject({ status: "not_evaluable", periods: [] });
  });

  it("calculates FCFF, DCF, and reverse DCF deterministically", () => {
    expect(calculateFcff({ ebit: 100, taxRate: 0.2, depreciationAndAmortization: 10, capitalExpenditure: 15, changeInNwc: 5 })).toEqual({ status: "ok", value: 70 });
    const dcf = calculateDcf(dcfInput);
    expect(dcf.status).toBe("ok");
    if (dcf.status !== "ok") throw new Error("Expected DCF result");
    expect(dcf.value.enterpriseValue).toBeCloseTo(1_292.720052, 3);

    const reverse = calculateReverseDcf({ ...dcfInput, marketPrice: dcf.value.fairValuePerShare });
    expect(reverse.status).toBe("ok");
    if (reverse.status !== "ok") throw new Error("Expected reverse DCF result");
    expect(reverse.value.impliedTerminalGrowth).toBeCloseTo(0.03, 8);
  });

  it("rejects terminal value calculations when WACC is not above terminal growth", () => {
    expect(calculateDcf({ ...dcfInput, wacc: 0.03 })).toEqual({
      status: "invalid_assumption",
      reason: "WACC_MUST_EXCEED_TERMINAL_GROWTH",
    });
  });

  it("builds a reconciling cash flow bridge from FY2024 inputs", () => {
    const result = buildCashFlowBridge({
      netIncome: 2_450_000_000_250,
      depreciationAndAmortization: 430_000_000_000,
      changeInNwc: 210_000_000_000,
      operatingCashFlow: 1_950_000_000_500,
      capitalExpenditure: 550_000_000_000,
      ebit: 3_375_000_000_000,
      taxRate: 0.22,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected a cash flow bridge result");
    const byKey = Object.fromEntries(result.value.lines.map((line) => [line.key, line.value]));
    expect(byKey.netIncome + byKey.depreciationAndAmortization + byKey.workingCapitalDrag + byKey.otherAdjustments).toBeCloseTo(byKey.cashFromOperations, 6);
    expect(byKey.cashFromOperations + byKey.capitalExpenditure + byKey.taxAndOtherAdjustments).toBeCloseTo(byKey.fcff, 6);
    expect(byKey.workingCapitalDrag).toBeLessThan(0);
    expect(byKey.capitalExpenditure).toBeLessThan(0);
    expect(result.value.lines.find((line) => line.key === "otherAdjustments")?.label).toBe("Unexplained Working Capital Residual");
    expect(result.value.cashFromOperations).toBe(1_950_000_000_500);
    expect(result.value.fcff).toBeCloseTo(2_302_500_000_000, 6);
    expect(result.value.workingCapitalDragPct).toBeCloseTo(0.0857, 4);
    expect(result.value.cashLeakPct).toBeCloseTo(0.2041, 4);
  });

  it("returns incomplete data for a cash flow bridge with missing inputs", () => {
    expect(buildCashFlowBridge({ netIncome: 100 } as never)).toMatchObject({ status: "incomplete_data" });
  });

  it("maps fair value across the WACC and terminal growth grid with the baseline near Rp 941", () => {
    const base = calculateFcff({ ebit: 3_375_000_000_000, taxRate: 0.22, depreciationAndAmortization: 430_000_000_000, capitalExpenditure: 550_000_000_000, changeInNwc: 210_000_000_000 });
    if (base.status !== "ok") throw new Error("Expected a base FCFF result");
    const adjusted = applyFcffHaircut(Array.from({ length: 5 }, (_, index) => base.value * 1.05 ** (index + 1)), 0.15);
    if (adjusted.status !== "ok") throw new Error("Expected a haircut result");
    const matrix = buildValuationSensitivity(
      { forecastFcff: adjusted.value, wacc: 0.12, terminalGrowth: 0.04, cash: 4_100_000_000_000, totalDebt: 11_800_000_000_000, minorityInterest: 0, sharesOutstanding: 20_000_000_000 },
      [0.08, 0.09, 0.1, 0.11, 0.12],
      [0.01, 0.02, 0.03, 0.04, 0.05],
    );
    expect(matrix.wacc).toEqual([0.08, 0.09, 0.1, 0.11, 0.12]);
    expect(matrix.values[3][4]).toBeCloseTo(941.109455, 3);
    const baselineRow = matrix.values[3];
    for (let index = 1; index < baselineRow.length; index += 1) expect(baselineRow[index]!).toBeLessThan(baselineRow[index - 1]!);
  });

  const akraPeriods = [
    { periodEnd: "2023-12-31", netIncome: 2100000000500, operatingCashFlow: 1800000000250, revenue: 42500000000250, accountsReceivable: 3900000000000 },
    { periodEnd: "2024-12-31", netIncome: 2450000000250, operatingCashFlow: 1950000000500, revenue: 46750000000750, accountsReceivable: 4650000000000 },
  ];

  it("computes a multi-period earnings quality scorecard deterministically", () => {
    const result = computeEarningsQualityScorecard(akraPeriods, { sector: "Energy" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected a scorecard result");
    expect(result.value.score).toBe(66);
    expect(result.value.grade).toBe("C");
    expect(result.value.gradeLabel).toBe("Watchlist: accrual build-up");
    expect(result.value.periods).toHaveLength(2);
    expect(result.value.dsoTrendDays).toBeGreaterThan(0);
    expect(result.value.receivablesDivergence).toBeCloseTo(1.9231, 3);
    expect(result.value.sectorThresholds.targetCfoNi).toBe(0.85);
  });

  it("grades high-quality cash-backed earnings as A", () => {
    const result = computeEarningsQualityScorecard([
      { periodEnd: "2023-12-31", netIncome: 100, operatingCashFlow: 120, revenue: 1000, accountsReceivable: 50 },
      { periodEnd: "2024-12-31", netIncome: 110, operatingCashFlow: 140, revenue: 1150, accountsReceivable: 52 },
    ]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected a scorecard result");
    expect(result.value.score).toBe(100);
    expect(result.value.grade).toBe("A");
  });

  it("grades aggressive working-capital accruals as D", () => {
    const result = computeEarningsQualityScorecard([
      { periodEnd: "2023-12-31", netIncome: 100, operatingCashFlow: 20, revenue: 1000, accountsReceivable: 400 },
      { periodEnd: "2024-12-31", netIncome: 100, operatingCashFlow: 10, revenue: 1100, accountsReceivable: 800 },
    ], { sector: "Energy" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected a scorecard result");
    expect(result.value.grade).toBe("D");
    expect(result.value.score).toBeLessThanOrEqual(30);
  });

  it("returns incomplete data for a scorecard with fewer than two complete periods", () => {
    expect(computeEarningsQualityScorecard([{ periodEnd: "2024-12-31", netIncome: 100, operatingCashFlow: 80, revenue: 1000, accountsReceivable: 100 }])).toMatchObject({ status: "incomplete_data" });
  });

  it("applies sector-specific quality thresholds and falls back to defaults", () => {
    expect(qualityThresholdsForSector("Energy")).toMatchObject({ targetCfoNi: 0.85, maxDivergence: 1.4 });
    expect(qualityThresholdsForSector("Unknown Sector")).toEqual(DEFAULT_QUALITY_THRESHOLDS);
    expect(qualityThresholdsForSector(undefined)).toEqual(DEFAULT_QUALITY_THRESHOLDS);
  });

  it("respects custom thresholds passed to the scorecard", () => {
    const result = computeEarningsQualityScorecard(akraPeriods, { thresholds: { targetCfoNi: 0.5, maxDivergence: 5, maxDsoDays: 365 } });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected a scorecard result");
    expect(result.value.sectorThresholds.targetCfoNi).toBe(0.5);
    expect(result.value.score).toBeGreaterThan(50);
  });

  it("penalizes extreme negative divergence and caps cash conversion breach at Grade C", () => {
    const result = computeEarningsQualityScorecard([
      { periodEnd: "2023-12-31", netIncome: 1000, operatingCashFlow: 700, revenue: 10000, accountsReceivable: 1000 },
      { periodEnd: "2024-12-31", netIncome: 1000, operatingCashFlow: 720, revenue: 10100, accountsReceivable: 883 },
    ], { sector: "Energy" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected a scorecard result");
    expect(result.value.receivablesDivergence).toBeLessThan(0);
    expect(result.value.score).toBeLessThanOrEqual(65);
    expect(["C", "D"]).toContain(result.value.grade);
  });

  it("falls back to a safe net-asset value when FCFF is distressed and sets DISTRESSED_CASHFLOW status", () => {
    const result = calculateDcf({ forecastFcff: [-100, -90, -80, -70, -60], wacc: 0.1, terminalGrowth: 0.03, cash: 50, totalDebt: 20, minorityInterest: 0, sharesOutstanding: 10 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected a DCF result");
    expect(result.value.dcfApplicable).toBe(false);
    expect(result.value.distressFallbackPerShare).toBeCloseTo(3, 6);
    expect(result.value.fairValuePerShare).toBeCloseTo(3, 6);
    expect(result.value.modelStatus).toBe("DISTRESSED_CASHFLOW");
  });

  it("flags a net cash position consistently in the equity bridge", () => {
    const result = calculateDcf({ forecastFcff: [100, 100, 100, 100, 100], wacc: 0.1, terminalGrowth: 0.03, cash: 500, totalDebt: 20, minorityInterest: 0, sharesOutstanding: 10 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected a DCF result");
    expect(result.value.netCashPosition).toBe(true);
    expect(result.value.dcfApplicable).toBe(true);
    expect(result.value.distressFallbackPerShare).toBeNull();
  });

  it("rejects non-finite FCFF outputs instead of leaking Infinity", () => {
    expect(calculateFcff({ ebit: 1e308, taxRate: 0, depreciationAndAmortization: 1e308, capitalExpenditure: 0, changeInNwc: 0 })).toEqual({ status: "invalid_assumption", reason: "NON_FINITE_OUTPUT" });
  });

  it("guards reverse DCF convergence for extreme market prices", () => {
    const result = calculateReverseDcf({ ...dcfInput, marketPrice: 1e15 });
    expect(result.status).toBe("invalid_assumption");
    if (result.status !== "invalid_assumption") throw new Error("Expected a guarded reverse DCF");
    expect(["IMPLIED_GROWTH_NOT_SOLVABLE", "UNCONVERGED"]).toContain(result.reason);
  });
});
