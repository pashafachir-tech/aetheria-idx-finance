import { describe, expect, it } from "vitest";
import { computeFinancialVerdict } from "../apps/web/lib/verdict";

describe("financial safety verdict", () => {
  it("returns green when cash is strong and receivables are balanced", () => {
    const result = computeFinancialVerdict({ cfoNi: 1.0, divergence: 1.1, fairValueAboveMarket: true, grade: "A" });
    expect(result.verdict).toBe("aman");
    expect(result.emoji).toBe("🟢");
    expect(result.reasons).toHaveLength(3);
  });

  it("returns yellow for the AKRA-like accrual build-up", () => {
    const result = computeFinancialVerdict({ cfoNi: 0.8, divergence: 1.92, fairValueAboveMarket: false, grade: "C" });
    expect(result.verdict).toBe("waspada");
    expect(result.reasons.join(" ")).toMatch(/tertahan|pengawasan/);
  });

  it("returns red when earnings are not cash-backed", () => {
    const result = computeFinancialVerdict({ cfoNi: 0.3, divergence: 1.0, fairValueAboveMarket: false, grade: "C" });
    expect(result.verdict).toBe("risiko");
    expect(result.emoji).toBe("🔴");
  });

  it("stays cautious when data is incomplete", () => {
    const result = computeFinancialVerdict({ cfoNi: null, divergence: null, fairValueAboveMarket: null, grade: null });
    expect(result.verdict).toBe("waspada");
    expect(result.reasons).toHaveLength(3);
  });
});