import { describe, expect, it, vi } from "vitest";
import { AgentOrchestrator, type MemoWriter, type ResearchDataSource, type ResearchPlanner } from "../packages/agent-orchestrator/src/index.js";
import type { EvidenceRef } from "../packages/domain/src/index.js";

const evidence: EvidenceRef = {
  id: "sectors:financial-statements:akra:2024",
  provider: "sectors",
  operation: "getFinancialStatements",
  retrievedAt: "2026-09-19T00:00:00.000Z",
  cacheStatus: "hit",
};

const collected = {
  forensicPeriods: [
    { periodEnd: "2023-12-31", netIncome: 100, operatingCashFlow: 60, revenue: 1_000, accountsReceivable: 100 },
    { periodEnd: "2024-12-31", netIncome: 120, operatingCashFlow: 60, revenue: 1_100, accountsReceivable: 130 },
  ],
  valuation: { forecastFcff: [100, 100, 100, 100, 100], wacc: 0.1, terminalGrowth: 0.03, cash: 50, totalDebt: 20, minorityInterest: 0, sharesOutstanding: 10 },
  evidence: [evidence],
  suggestedHaircut: 0.15,
};

const planner: ResearchPlanner = { createPlan: vi.fn().mockResolvedValue({ objective: "Assess AKRA", steps: [{ id: "collect", description: "Collect Sectors evidence" }] }) };

function writer(draft = { narrative: "Evidence supports the stated facts.", selectedFactIds: ["cfo-to-ni", "fair-value"], citedEvidenceIds: [evidence.id] }): MemoWriter {
  return { writeMemo: vi.fn().mockResolvedValue(draft) };
}

describe("AgentOrchestrator", () => {
  it("moves through the constrained workflow and applies a durable analyst haircut", async () => {
    const orchestrator = new AgentOrchestrator(planner, writer(), () => new Date("2026-09-19T10:00:00.000Z"));

    await orchestrator.plan("akra");
    expect(orchestrator.collect(collected).state).toBe("validating");
    expect(orchestrator.validate().state).toBe("forensics");
    expect(orchestrator.runForensics().state).toBe("awaiting_analyst");
    const valuing = orchestrator.recordAnalystDecision({ action: "apply", finalHaircut: 0 });
    expect(valuing).toMatchObject({ state: "valuing", analystDecision: { finalHaircut: 0.15, decidedAt: "2026-09-19T10:00:00.000Z" } });
    expect(orchestrator.value().state).toBe("synthesizing");
    expect((await orchestrator.synthesize()).state).toBe("exporting");
    expect(orchestrator.completeExport().state).toBe("completed");
  });

  it("fails validation before forensics when evidence or data is incomplete", async () => {
    const orchestrator = new AgentOrchestrator(planner, writer());
    await orchestrator.plan("AKRA");
    orchestrator.collect({ ...collected, evidence: [], forensicPeriods: [{ periodEnd: "2024-12-31", netIncome: 100, operatingCashFlow: null }] });

    expect(orchestrator.validate()).toMatchObject({ state: "failed", failure: "Collected research requires at least one evidence reference." });
  });

  it("rejects LLM memo drafts with numeric claims or unknown evidence", async () => {
    const orchestrator = new AgentOrchestrator(planner, writer({ narrative: "Fair value is 100.", selectedFactIds: ["fair-value"], citedEvidenceIds: ["invented-source"] }));
    await orchestrator.plan("AKRA");
    orchestrator.collect(collected);
    orchestrator.validate();
    orchestrator.runForensics();
    orchestrator.recordAnalystDecision({ action: "dismiss", finalHaircut: 0 });
    orchestrator.value();

    await expect(orchestrator.synthesize()).resolves.toMatchObject({ state: "failed", failure: expect.stringContaining("unsupported") });
  });

  it("prevents state transitions that skip collection", () => {
    const orchestrator = new AgentOrchestrator(planner, writer());
    expect(() => orchestrator.validate()).toThrow("expected validating");
  });

  it("runs a ticker through the analyst checkpoint and applies the durable haircut via a data source", async () => {
    const dataSource: ResearchDataSource = { load: vi.fn().mockResolvedValue(collected) };
    const orchestrator = new AgentOrchestrator(planner, writer(), { now: () => new Date("2026-09-19T10:00:00.000Z"), dataSource });

    const runSnapshot = await orchestrator.run("AKRA");
    expect(runSnapshot.state).toBe("awaiting_analyst");
    expect(runSnapshot.forensics).toBeDefined();

    const decided = await orchestrator.applyDecision({ action: "apply", finalHaircut: 0, rationale: "Accept the engine suggestion." });
    expect(decided.state).toBe("exporting");
    expect(decided.analystDecision).toMatchObject({ action: "apply", finalHaircut: 0.15 });
    expect(decided.valuation).toBeDefined();
  });

  it("fails the run without a configured data source", async () => {
    const orchestrator = new AgentOrchestrator(planner, writer());
    const snapshot = await orchestrator.run("AKRA");
    expect(snapshot.state).toBe("failed");
    expect(snapshot.failure).toBe("Research data source is not configured.");
  });
});
