import { describe, expect, it } from "vitest";
import { runAutonomousInvestigation } from "../apps/web/lib/agent-orchestrator";

describe("Autonomous Agent Orchestrator", () => {
  it("executes the 5-node investigation DAG for BBCA with high conviction output", async () => {
    const report = await runAutonomousInvestigation("BBCA", "smart_money");

    expect(report.ticker).toBe("BBCA");
    expect(report.status).toBe("COMPLETE");
    expect(report.dagNodesExecuted).toBe(5);
    expect(report.steps).toHaveLength(5);

    // Node 1: Fundamental Forensics
    expect(report.steps[0].nodeId).toBe("fundamental_forensics");
    expect(report.steps[0].observation.summary).toContain("Valuasi");

    // Node 2: Smart Money Flow
    expect(report.steps[1].nodeId).toBe("smart_money_flow");
    expect(report.artifacts.smartMoneyFlow.topAccumulators.length).toBeGreaterThan(0);

    // Node 3: Segment Moat
    expect(report.steps[2].nodeId).toBe("segment_moat");
    expect(report.artifacts.revenueSegments.segments.length).toBeGreaterThan(0);

    // Node 4: Governance Audit
    expect(report.steps[3].nodeId).toBe("governance_audit");
    expect(report.artifacts.governanceMatrix.gcgScore).toBeGreaterThanOrEqual(70);

    // Node 5: Synthesis
    expect(report.steps[4].nodeId).toBe("thesis_synthesis");
    expect(["STRONGLY ACCUMULATE", "TACTICAL HOLD", "DEFENSIVE AVOID"]).toContain(report.memo.overallStance);
    expect(report.memo.bullCaseArguments).toHaveLength(3);
    expect(report.memo.bearCaseArguments).toHaveLength(3);
    expect(report.memo.killCriteriaChecklist).toHaveLength(3);
    expect(report.memo.markdownReport).toContain("INSTITUTIONAL INVESTMENT COMMITTEE MEMORANDUM");
  });

  it("handles non-bank ticker AKRA with forensic focus", async () => {
    const report = await runAutonomousInvestigation("AKRA", "forensic");

    expect(report.ticker).toBe("AKRA");
    expect(report.artifacts.revenueSegments.segments.some((s) => s.segment.includes("BBM") || s.segment.includes("Petroleum"))).toBe(true);
    expect(report.artifacts.valuationConvergence.modelName).toBe("FCFF_DCF");
    expect(report.memo.killCriteriaChecklist).toHaveLength(3);
  });

  it("routes BBCA to Residual Income Model (Clean Surplus) with banking metrics and insider watchdog", async () => {
    const report = await runAutonomousInvestigation("BBCA");

    // Unified 360 Institutional default
    expect(report.focus).toBe("360_institutional");

    // Node 1: Residual Income Model
    expect(report.steps[0].action.tool).toContain("rimKernel");
    expect(report.steps[0].action.input.model).toBe("RESIDUAL_INCOME");
    expect(report.steps[0].observation.summary).toContain("RESIDUAL_INCOME");
    expect(report.steps[0].observation.summary).toContain("NIM ~5.7%");
    expect(report.steps[0].observation.summary).toContain("ROE ~20.4%");
    expect(report.steps[0].observation.summary).toContain("NPL 2.8%");
    expect(report.artifacts.valuationConvergence.modelName).toBe("RESIDUAL_INCOME");
    expect(report.artifacts.valuationConvergence.modelIntrinsicValue).toBeGreaterThan(5000);

    // Node 4: Insider Watchdog & Corporate Actions Sentinel
    expect(report.artifacts.governanceMatrix.insiderWatchdog).toBeDefined();
    expect(report.artifacts.governanceMatrix.insiderWatchdog?.status).toBe("VERIFIED");
    expect(report.artifacts.governanceMatrix.corporateActionsSentinel).toBeDefined();
    expect(report.artifacts.governanceMatrix.corporateActionsSentinel?.status).toBe("DIVIDEND_DECLARED");
  });
});