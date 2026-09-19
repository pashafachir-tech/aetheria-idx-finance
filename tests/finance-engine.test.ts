import { describe, expect, it } from "vitest";
import {
  calculateDcf,
  calculateFcff,
  calculateReverseDcf,
  evaluateCfoToNi,
  evaluateReceivablesDivergence,
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
});
