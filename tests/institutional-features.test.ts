import { describe, expect, it } from "vitest";
import { startResearch } from "../apps/web/lib/research-service";

describe("Institutional Features & Defensive Quant Kernel", () => {
  it("provides comprehensive DAG execution trace and cryptographic lineage", async () => {
    process.env.USE_FIXTURES = "true";
    const result = await startResearch("AKRA");

    expect(result.presentation.dagTrace).toBeDefined();
    expect(Array.isArray(result.presentation.dagTrace)).toBe(true);
    expect(result.presentation.dagTrace!.length).toBeGreaterThanOrEqual(4);

    const operations = result.presentation.dagTrace!.map((t) => t.operation);
    expect(operations).toContain("getCompanyProfile");
    expect(operations).toContain("getDailyMarketData");
    expect(operations).toContain("getSubsectorPeers");
    expect(operations).toContain("getFinancialStatements");

    for (const node of result.presentation.dagTrace!) {
      expect(node.evidenceId).toContain("sectors:");
      expect(["HIT", "MISS"]).toContain(node.cacheStatus);
      expect(typeof node.latencyMs).toBe("number");
      expect(node.latencyMs).toBeGreaterThanOrEqual(0);
      expect(node.timestamp).toBeTruthy();
    }
  });

  it("routes BBRI banking issuer with residual income DAG trace", async () => {
    process.env.USE_FIXTURES = "true";
    const result = await startResearch("BBRI");

    expect(result.presentation.modelApplicability?.model).toBe("RESIDUAL_INCOME");
    expect(result.presentation.dagTrace).toBeDefined();

    const operations = result.presentation.dagTrace!.map((t) => t.operation);
    expect(operations).toContain("getFinancialMetrics");
  });
});
