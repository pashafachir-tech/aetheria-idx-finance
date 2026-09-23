import { describe, expect, it } from "vitest";
import { calculateDividendDiscount, calculateResidualIncome, isFinancialSector, routeValuationModel } from "../packages/finance-engine/src/index.js";

describe("engine router", () => {
  it("routes financial-sector issuers to the residual income model", () => {
    const routing = routeValuationModel({ ticker: "BBCA", sector: "Financials" });
    expect(routing.coverage).toBe("financial");
    expect(routing.model).toBe("RESIDUAL_INCOME");
    expect(routing.alternatives).toContain("DIVIDEND_DISCOUNT");
    expect(routing.rationale).toMatch(/book value/i);
  });

  it("routes non-financial issuers to FCFF DCF", () => {
    const routing = routeValuationModel({ ticker: "AKRA", sector: "Energy" });
    expect(routing.coverage).toBe("non_financial");
    expect(routing.model).toBe("FCFF_DCF");
    expect(routing.alternatives).toHaveLength(0);
  });

  it("recognises common financial-sector labels", () => {
    for (const sector of ["Financials", "Banking", "Banks", "Multifinance", "Insurance", "financial services"]) {
      expect(isFinancialSector(sector)).toBe(true);
    }
    expect(isFinancialSector("Energy")).toBe(false);
    expect(isFinancialSector(undefined)).toBe(false);
  });
});

describe("residual income model", () => {
  it("values equity as book value plus discounted residual income", () => {
    const result = calculateResidualIncome({ bookValuePerShare: 1000, roe: 0.18, costOfEquity: 0.11, growth: 0.03, payoutRatio: 0.4, years: 5 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected a residual income result");
    expect(result.value.fairValuePerShare).toBeGreaterThan(1000);
    expect(result.value.presentValueOfResidualIncome).toBeGreaterThan(0);
    expect(result.value.terminalValue).toBeGreaterThan(0);
  });

  it("rejects a cost of equity that is not above terminal growth", () => {
    expect(calculateResidualIncome({ bookValuePerShare: 1000, roe: 0.18, costOfEquity: 0.02, growth: 0.03, payoutRatio: 0.4, years: 5 })).toEqual({
      status: "invalid_assumption",
      reason: "WACC_MUST_EXCEED_TERMINAL_GROWTH",
    });
  });

  it("returns incomplete data when financial inputs are missing", () => {
    expect(calculateResidualIncome({ bookValuePerShare: 1000 })).toMatchObject({ status: "incomplete_data" });
  });

  it("flags a non-positive book value as incomplete", () => {
    expect(calculateResidualIncome({ bookValuePerShare: 0, roe: 0.18, costOfEquity: 0.11, growth: 0.03, payoutRatio: 0.4, years: 5 })).toMatchObject({ status: "incomplete_data" });
  });
});

describe("dividend discount model", () => {
  it("values equity from the next dividend and the growth spread", () => {
    const result = calculateDividendDiscount({ dividendPerShare: 100, costOfEquity: 0.11, growth: 0.04 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected a dividend discount result");
    expect(result.value.nextDividend).toBeCloseTo(104, 6);
    expect(result.value.fairValuePerShare).toBeCloseTo(104 / 0.07, 6);
  });

  it("rejects a cost of equity that is not above terminal growth", () => {
    expect(calculateDividendDiscount({ dividendPerShare: 100, costOfEquity: 0.04, growth: 0.04 })).toMatchObject({ status: "invalid_assumption" });
  });
});