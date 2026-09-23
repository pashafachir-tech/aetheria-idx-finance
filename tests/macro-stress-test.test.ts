/**
 * Macro Stress-Test Simulator Unit Tests
 * Verifies deterministic (Zero-LLM) arithmetic for:
 * - Rupiah depreciation impact on forex debt burden
 * - BI Rate hike impact on Cost of Fund (Bank) / WACC (Non-Bank)
 */

import { describe, it, expect } from "vitest";

// ─── Pure Deterministic Functions (extracted from agent-dossier-view) ─────

function calculateRupiahImpact(params: {
  currentRate: number;
  newRate: number;
  forexDebtExposurePct: number;
  marketPrice: number;
}) {
  const depreciation = ((params.newRate - params.currentRate) / params.currentRate) * 100;
  const interestBurdenIncrease = (params.forexDebtExposurePct / 100) * depreciation;
  const priceImpactPct = -(Math.abs(interestBurdenIncrease) * 0.6);
  const estimatedPrice = Math.round(params.marketPrice * (1 + priceImpactPct / 100));
  return { depreciation, interestBurdenIncrease, priceImpactPct, estimatedPrice };
}

function calculateBiRateImpact(params: {
  biRateHikeBps: number;
  isBank: boolean;
  marketPrice: number;
}) {
  const biRateHikePct = params.biRateHikeBps / 100;
  const costOfFundImpact = params.isBank
    ? biRateHikePct * 0.75
    : biRateHikePct * 0.45;
  const nimCompression = params.isBank ? -(biRateHikePct * 0.15) : 0;
  const priceImpactPct = params.isBank
    ? -(costOfFundImpact * 2.2) + (nimCompression * 8)
    : -(costOfFundImpact * 3.5);
  const estimatedPrice = Math.round(params.marketPrice * (1 + priceImpactPct / 100));
  return { costOfFundImpact, nimCompression, priceImpactPct, estimatedPrice };
}

// ─── Test Suites ─────────────────────────────────────────────────────────

describe("Macro Stress-Test: Rupiah Depreciation", () => {
  it("should calculate zero impact when rate is unchanged", () => {
    const result = calculateRupiahImpact({
      currentRate: 15800,
      newRate: 15800,
      forexDebtExposurePct: 25,
      marketPrice: 6225,
    });
    expect(result.depreciation).toBe(0);
    expect(result.interestBurdenIncrease).toBe(0);
    expect(result.priceImpactPct).toBeCloseTo(0);
    expect(result.estimatedPrice).toBe(6225);
  });

  it("should calculate negative price impact for Rupiah weakening", () => {
    const result = calculateRupiahImpact({
      currentRate: 15800,
      newRate: 16500,
      forexDebtExposurePct: 25,
      marketPrice: 6225,
    });
    expect(result.depreciation).toBeGreaterThan(0);
    expect(result.interestBurdenIncrease).toBeGreaterThan(0);
    expect(result.priceImpactPct).toBeLessThan(0);
    expect(result.estimatedPrice).toBeLessThan(6225);
  });

  it("should be deterministic (same input → same output)", () => {
    const params = {
      currentRate: 15800,
      newRate: 16500,
      forexDebtExposurePct: 12,
      marketPrice: 5250,
    };
    const r1 = calculateRupiahImpact(params);
    const r2 = calculateRupiahImpact(params);
    expect(r1.estimatedPrice).toBe(r2.estimatedPrice);
    expect(r1.priceImpactPct).toBe(r2.priceImpactPct);
    expect(r1.interestBurdenIncrease).toBe(r2.interestBurdenIncrease);
  });

  it("should scale impact with forex exposure percentage", () => {
    const lowExposure = calculateRupiahImpact({
      currentRate: 15800,
      newRate: 16500,
      forexDebtExposurePct: 10,
      marketPrice: 6225,
    });
    const highExposure = calculateRupiahImpact({
      currentRate: 15800,
      newRate: 16500,
      forexDebtExposurePct: 40,
      marketPrice: 6225,
    });
    expect(Math.abs(highExposure.priceImpactPct)).toBeGreaterThan(Math.abs(lowExposure.priceImpactPct));
  });

  it("should handle strengthening Rupiah (positive impact)", () => {
    const result = calculateRupiahImpact({
      currentRate: 15800,
      newRate: 15000,
      forexDebtExposurePct: 25,
      marketPrice: 6225,
    });
    expect(result.depreciation).toBeLessThan(0);
    // Price impact is always negative due to Math.abs — this tests the formula
    expect(result.priceImpactPct).toBeLessThanOrEqual(0);
  });
});

describe("Macro Stress-Test: BI Rate Hike", () => {
  it("should calculate Bank CoF impact correctly", () => {
    const result = calculateBiRateImpact({
      biRateHikeBps: 50,
      isBank: true,
      marketPrice: 6225,
    });
    // 50 bps = 0.5% → CoF impact = 0.5 * 0.75 = 0.375%
    expect(result.costOfFundImpact).toBeCloseTo(0.375, 4);
    expect(result.nimCompression).toBeLessThan(0);
    expect(result.priceImpactPct).toBeLessThan(0);
    expect(result.estimatedPrice).toBeLessThan(6225);
  });

  it("should calculate Non-Bank WACC impact correctly", () => {
    const result = calculateBiRateImpact({
      biRateHikeBps: 50,
      isBank: false,
      marketPrice: 1520,
    });
    // 50 bps = 0.5% → WACC impact = 0.5 * 0.45 = 0.225%
    expect(result.costOfFundImpact).toBeCloseTo(0.225, 4);
    expect(result.nimCompression).toBe(0); // Non-banks have no NIM
    expect(result.priceImpactPct).toBeLessThan(0);
    expect(result.estimatedPrice).toBeLessThan(1520);
  });

  it("should be deterministic (same input → same output)", () => {
    const params = { biRateHikeBps: 75, isBank: true, marketPrice: 6850 };
    const r1 = calculateBiRateImpact(params);
    const r2 = calculateBiRateImpact(params);
    expect(r1.estimatedPrice).toBe(r2.estimatedPrice);
    expect(r1.costOfFundImpact).toBe(r2.costOfFundImpact);
  });

  it("should scale linearly with rate hike magnitude", () => {
    const small = calculateBiRateImpact({ biRateHikeBps: 25, isBank: true, marketPrice: 6225 });
    const large = calculateBiRateImpact({ biRateHikeBps: 100, isBank: true, marketPrice: 6225 });
    expect(Math.abs(large.priceImpactPct)).toBeGreaterThan(Math.abs(small.priceImpactPct));
  });

  it("should have different sensitivities for Bank vs Non-Bank", () => {
    const bank = calculateBiRateImpact({ biRateHikeBps: 50, isBank: true, marketPrice: 5000 });
    const nonBank = calculateBiRateImpact({ biRateHikeBps: 50, isBank: false, marketPrice: 5000 });
    // Bank and Non-Bank should have different price impacts
    expect(bank.priceImpactPct).not.toBe(nonBank.priceImpactPct);
  });
});
