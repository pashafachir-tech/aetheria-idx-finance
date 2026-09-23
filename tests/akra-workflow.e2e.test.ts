import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { AgentOrchestrator, type MemoWriter, type ResearchPlanner } from "../packages/agent-orchestrator/src/index.js";
import type { RawResponseCache, SectorsClient } from "../packages/sectors-adapter/src/index.js";
import { SectorsAdapter } from "../packages/sectors-adapter/src/index.js";
import { createResearchWorkbook } from "../packages/xlsx-export/src/index.js";
import profile from "../fixtures/akra/company-profile.json";
import financials from "../fixtures/akra/financial-statements.json";
import market from "../fixtures/akra/daily-market-data.json";
import peers from "../fixtures/akra/subsector-peers.json";

function cache(): RawResponseCache {
  const data = new Map<string, unknown>();
  return { get: async (key) => data.get(key), set: async (key, value) => void data.set(key, value) };
}

const client: SectorsClient = {
  getCompanyProfile: vi.fn().mockResolvedValue(profile),
  getFinancialStatements: vi.fn().mockResolvedValue(financials),
  getDailyMarketData: vi.fn().mockResolvedValue(market),
  getSubsectorPeers: vi.fn().mockResolvedValue(peers),
};

const planner: ResearchPlanner = { createPlan: vi.fn().mockResolvedValue({ objective: "Assess AKRA", steps: [{ id: "collect", description: "Collect Sectors evidence" }] }) };

describe("AKRA workflow E2E", () => {
  it("moves fixture-backed evidence through analyst approval into a formula workbook", async () => {
    const adapter = new SectorsAdapter(client, cache());
    const [company, history, snapshot] = await Promise.all([
      adapter.getCompanyProfile("AKRA"), adapter.getFinancialStatements("AKRA"), adapter.getDailyMarketData("AKRA"),
    ]);
    expect(company.data.coverage).toBe("supported");
    expect(company.toolCall).toMatchObject({ operation: "getCompanyProfile", cacheStatus: "MISS" });

    const evidence = [company.evidence, history.evidence, snapshot.evidence];
    const memoWriter: MemoWriter = { writeMemo: vi.fn().mockResolvedValue({ narrative: "Evidence supports the selected facts.", selectedFactIds: ["cfo-to-ni", "fair-value"], citedEvidenceIds: evidence.map((item) => item.id) }) };
    const orchestrator = new AgentOrchestrator(planner, memoWriter, () => new Date("2026-09-19T10:00:00.000Z"));
    await orchestrator.plan("AKRA");
    orchestrator.collect({
      forensicPeriods: history.data.annual.map((statement) => ({ periodEnd: statement.periodEnd, netIncome: statement.netIncome.value, operatingCashFlow: statement.operatingCashFlow.value, revenue: statement.revenue.value, accountsReceivable: statement.accountsReceivable.value })),
      valuation: { forecastFcff: [2_500_000_000_000, 2_725_000_000_000, 2_950_000_000_000, 3_200_000_000_000, 3_450_000_000_000], wacc: 0.12, terminalGrowth: 0.04, cash: 4_100_000_000_000, totalDebt: 11_800_000_000_000, minorityInterest: 0, sharesOutstanding: snapshot.data.sharesOutstanding.value },
      evidence,
      suggestedHaircut: 0.15,
    });
    orchestrator.audit();
    orchestrator.validate();
    orchestrator.runForensics();
    orchestrator.recordAnalystDecision({ action: "apply", finalHaircut: 0, rationale: "Receivables signal requires a conservative scenario." });
    orchestrator.value();
    orchestrator.verify();
    await orchestrator.synthesize();
    const completed = orchestrator.completeExport();
    expect(completed.state).toBe("completed");

    const workbookBuffer = await createResearchWorkbook({
      ticker: "AKRA",
      financials: history.data.annual,
      market: snapshot.data,
      assumptions: { forecastFcff: [2_500_000_000_000, 2_725_000_000_000, 2_950_000_000_000, 3_200_000_000_000, 3_450_000_000_000], wacc: 0.12, terminalGrowth: 0.04, taxRate: 0.22, haircut: completed.analystDecision!.finalHaircut, cash: 4_100_000_000_000, totalDebt: 11_800_000_000_000, minorityInterest: 0, sharesOutstanding: snapshot.data.sharesOutstanding.value },
      analystDecision: completed.analystDecision!,
      evidence,
      auditTrail: [{ timestamp: "2026-09-19T10:00:00.000Z", state: "completed", detail: "AKRA research workflow completed" }],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBuffer as never);
    const dcf = workbook.getWorksheet("DCF")!;
    expect(dcf.getCell("F12").value).toEqual({ formula: "F11/Assumptions!$B$9" });
    expect(workbook.getWorksheet("Audit Trail")!.rowCount).toBeGreaterThanOrEqual(5);
  });
});
