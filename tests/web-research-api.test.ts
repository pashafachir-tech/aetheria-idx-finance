import { afterEach, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { POST as startResearchRoute } from "../apps/web/app/api/research/route";
import { POST as decisionRoute } from "../apps/web/app/api/research/[id]/decision/route";
import { GET as workbookRoute } from "../apps/web/app/api/research/[id]/workbook/route";

describe("web research workflow API", () => {
  beforeAll(() => {
    process.env.USE_FIXTURES = "true";
  });
  afterEach(() => {
    delete process.env.SECTORS_API_BASE_URL;
    delete process.env.SECTORS_API_KEY;
  });

  async function startRun() {
    const response = await startResearchRoute(new Request("http://localhost/api/research", { method: "POST", body: JSON.stringify({ ticker: "AKRA" }) }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      id: string;
      snapshot: {
        state: string;
        plan?: { steps: unknown[] };
        collected?: { evidence: Array<{ cacheStatus: "hit" | "miss" }> };
        forensics?: { cfoToNi: { status: string }; receivablesDivergence: { status: string } };
        qualityScorecard?: { score: number; grade: string };
      };
      presentation: { suggestedHaircut: number; modelInputs: { forecastFcff: number[]; wacc: number } | null; cashFlowBridge: { fcff: number; workingCapitalDragPct: number } | null; modelApplicability: { model: string } | null };
    };
    return body;
  }

  it("runs AKRA to the analyst checkpoint through the Sectors adapter and orchestrator", async () => {
    const { id, snapshot, presentation } = await startRun();

    expect(snapshot.state).toBe("awaiting_analyst");
    expect(snapshot.plan?.steps.length).toBeGreaterThan(0);
    expect(snapshot.collected?.evidence.length).toBeGreaterThanOrEqual(10);
    expect(snapshot.collected?.evidence[0]?.cacheStatus).toBe("hit");
    expect(snapshot.forensics?.cfoToNi.status).toBe("clear");
    expect(snapshot.forensics?.receivablesDivergence.status).toBe("flagged");
    expect(presentation.suggestedHaircut).toBe(0.15);
    expect(presentation.modelInputs?.wacc).toBe(0.12);
    expect(presentation.modelInputs?.forecastFcff.length).toBe(5);
    expect(presentation.cashFlowBridge?.fcff).toBeCloseTo(2_302_500_000_000, 0);
    expect(presentation.cashFlowBridge?.workingCapitalDragPct).toBeCloseTo(0.0857, 4);
    expect(presentation.modelApplicability?.model).toBe("FCFF_DCF");
    expect(snapshot.qualityScorecard?.grade).toBe("C");
    expect(snapshot.qualityScorecard?.score).toBe(66);
    expect(id).toBeTruthy();
  });

  it("records the analyst decision and exports a workbook with the identical haircut", async () => {
    const { id } = await startRun();
    const decisionResponse = await decisionRoute(
      new Request("http://localhost/api/research/x/decision", { method: "POST", body: JSON.stringify({ action: "edit", finalHaircut: 0.15, rationale: "Apply the engine suggestion at the edited value." }) }),
      { params: Promise.resolve({ id }) },
    );
    expect(decisionResponse.status).toBe(200);
    const decisionBody = (await decisionResponse.json()) as {
      snapshot: { state: string; analystDecision: { action: string; finalHaircut: number }; valuation: { fairValuePerShare: number } };
      presentation: { suggestedHaircut: number; reverseDcf: { impliedTerminalGrowth: number } | null };
    };
    expect(decisionBody.snapshot.state).toBe("exporting");
    expect(decisionBody.presentation.suggestedHaircut).toBe(0.15);
    expect(decisionBody.snapshot.analystDecision).toMatchObject({ action: "edit", finalHaircut: 0.15 });
    expect(decisionBody.snapshot.valuation.fairValuePerShare).toBeCloseTo(941.109455, 3);
    expect(decisionBody.presentation.reverseDcf).not.toBeNull();
    expect(decisionBody.presentation.reverseDcf!.impliedTerminalGrowth).toBeCloseTo(0.0696545, 6);

    const workbookResponse = await workbookRoute(new Request("http://localhost/api/research/x/workbook?haircut=0.99"), { params: Promise.resolve({ id }) });
    expect(workbookResponse.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(await workbookResponse.arrayBuffer()) as never);
    const assumptions = workbook.getWorksheet("Assumptions")!;
    const dcf = workbook.getWorksheet("DCF")!;
    expect(assumptions.getCell("B5").value).toBe(0.15);
    expect(dcf.getCell("B4").value).toEqual({ formula: "B3*(1-Assumptions!$B$5)" });
    expect(dcf.getCell("F12").value).toEqual({ formula: "F11/Assumptions!$B$9" });
  });

  it("blocks workbook export before the analyst decision", async () => {
    const { id } = await startRun();
    const response = await workbookRoute(new Request("http://localhost/api/research/x/workbook"), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe("INCOMPLETE_DATA");
  });

  it("routes BBRI to the residual income model and reaches the analyst checkpoint", async () => {
    const response = await startResearchRoute(new Request("http://localhost/api/research", { method: "POST", body: JSON.stringify({ ticker: "BBRI" }) }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      snapshot: { state: string; collected?: { modelApplicability?: { model: string } } };
      presentation: { modelApplicability: { model: string; coverage: string } | null; bankMetrics: { roe: { value: number } } | null; residualIncome: unknown };
    };
    expect(body.snapshot.state).toBe("awaiting_analyst");
    expect(body.presentation.modelApplicability?.model).toBe("RESIDUAL_INCOME");
    expect(body.presentation.modelApplicability?.coverage).toBe("financial");
    expect(body.presentation.bankMetrics?.roe.value).toBeCloseTo(0.18, 6);
    expect(body.presentation.residualIncome).toBeNull();
  });
});