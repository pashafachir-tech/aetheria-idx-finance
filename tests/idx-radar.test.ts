import { describe, expect, it } from "vitest";
import { autoRejectionPctForPrice, computeIdxRadar, tickSizeForPrice } from "../apps/web/lib/idx-radar";

describe("IDX regulatory radar", () => {
  it("maps auto-rejection percentages to BEI price bands", () => {
    expect(autoRejectionPctForPrice(150)).toBe(35);
    expect(autoRejectionPctForPrice(1525.5)).toBe(25);
    expect(autoRejectionPctForPrice(8000)).toBe(20);
  });

  it("maps tick sizes to BEI price bands", () => {
    expect(tickSizeForPrice(150)).toBe(1);
    expect(tickSizeForPrice(1525.5)).toBe(5);
    expect(tickSizeForPrice(8000)).toBe(25);
  });

  it("computes ARA/ARB bounds, board, and conglomerate notes for AKRA and BBRI", () => {
    const akra = computeIdxRadar("AKRA", 1525.5);
    expect(akra.board).toBe("Papan Utama");
    expect(akra.supervision).toBe("Normal");
    expect(akra.autoRejectionPct).toBe(25);
    expect(akra.araPrice).toBeCloseTo(1525.5 * 1.25, 6);
    expect(akra.arbPrice).toBeCloseTo(1525.5 * 0.75, 6);
    expect(akra.relatedPartyNote).toMatch(/POJK|transaksi|pihak berelasi/);
    expect(computeIdxRadar("BBRI", 4520).relatedPartyNote).toMatch(/POJK|transaksi|pihak berelasi/);
  });

  it("does not fabricate ARA/ARB bounds without a price", () => {
    const radar = computeIdxRadar("AKRA", null);
    expect(radar.araPrice).toBeNull();
    expect(radar.arbPrice).toBeNull();
  });
});