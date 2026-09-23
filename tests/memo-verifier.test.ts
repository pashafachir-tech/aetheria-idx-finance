import { describe, expect, it } from "vitest";
import { redactUnverifiedClaims, verifyMemoClaims, verifyMemoDirection } from "../packages/agent-orchestrator/src/verify.js";

const ledger = [1525.5, 941.109, 0.15, 1.9231, 0.0697, 0.1, 62.1, -3.03, 0.86, 0.8];

describe("verifyMemoClaims", () => {
  it("verifies every number that reconciles to the financial ledger", () => {
    const memo = "AKRA trades at Rp 1.526 against fair value Rp 941, a 62.1% premium. Haircut 15%. Divergence 1.92x. Implied 6.97% vs historical 10.00%, gap -3.03%. CFO/NI 0.86x.";
    const result = verifyMemoClaims(memo, ledger);
    expect(result.unverified).toBe(0);
    expect(result.passed).toBe(true);
    expect(result.verified).toBe(result.total);
    expect(result.total).toBeGreaterThan(0);
  });

  it("flags and redacts numbers that are not backed by the ledger", () => {
    const memo = "Fair value Rp 941 but revenue surged 999%.";
    const result = verifyMemoClaims(memo, ledger);
    expect(result.passed).toBe(false);
    expect(result.unverified).toBeGreaterThan(0);

    const redacted = redactUnverifiedClaims(memo, result);
    expect(redacted.text).toContain("[unverified]");
    expect(redacted.redacted).toBeGreaterThan(0);
  });

  it("ignores calendar years so FY references are not flagged", () => {
    expect(verifyMemoClaims("FY2024 results were solid.", ledger).total).toBe(0);
  });

  it("treats a memo with no numeric claims as vacuously unverified-safe", () => {
    const result = verifyMemoClaims("Evidence supports the stated facts.", ledger);
    expect(result.total).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("normalizes magnitude words and separators with epsilon tolerance", () => {
    const magnitudeLedger = [1.5e12, 2.4e9, 42_500_000_000_250];
    expect(verifyMemoClaims("Pendapatan 1,5 Triliun.", magnitudeLedger).unverified).toBe(0);
    expect(verifyMemoClaims("Laba 2,4 miliar.", magnitudeLedger).unverified).toBe(0);
    expect(verifyMemoClaims("Pendapatan Rp 42.500.000.000.250.", magnitudeLedger).unverified).toBe(0);
  });

  it("exposes magnitude-aware parsing for a trillion-scale token", () => {
    const result = verifyMemoClaims("Belanja modal 1.2 triliun.", [1.2e12]);
    expect(result.claims[0]?.magnitude).toBe(1e12);
    expect(result.claims[0]?.verified).toBe(true);
  });

  it("intercepts fabricated adversarial claims that are absent from the ledger", () => {
    const memo = "AKRA membukukan pertumbuhan pendapatan 450% dan net debt Rp 0 dengan margin operasi 999%.";
    const result = verifyMemoClaims(memo, [1525.5, 941.109, 0.15, 66]);
    expect(result.passed).toBe(false);
    const tokens = result.claims.filter((claim) => !claim.verified).map((claim) => claim.token);
    expect(tokens).toContain("450%");
    expect(tokens.some((token) => token.includes("0"))).toBe(true);
    expect(tokens).toContain("999%");
  });

  it("rejects foreign-currency claims against an IDR ledger", () => {
    const usd = verifyMemoClaims("Valuasi USD 941.", [941.109], { baseCurrency: "IDR" });
    expect(usd.unverified).toBe(1);
    expect(usd.claims[0]?.currency).toBe("USD");

    const idr = verifyMemoClaims("Valuasi Rp 941.", [941.109], { baseCurrency: "IDR" });
    expect(idr.verified).toBe(1);
    expect(idr.claims[0]?.currency).toBe("IDR");
  });

  it("detects directional mismatches between adjectives and ledger deltas", () => {
    const bad = verifyMemoDirection("Pendapatan menurun tajam, namun manajemen tetap optimistis.", [{ metric: "pendapatan", delta: 0.12 }]);
    expect(bad.passed).toBe(false);
    expect(bad.checks[0]).toMatchObject({ metric: "pendapatan", expected: "up", passed: false });

    const good = verifyMemoDirection("Pendapatan naik tajam. Piutang menurun tajam.", [{ metric: "pendapatan", delta: 0.12 }, { metric: "piutang", delta: -0.2 }]);
    expect(good.passed).toBe(true);
  });
});