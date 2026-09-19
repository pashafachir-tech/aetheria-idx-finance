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
      };
      presentation: { suggestedHaircut: number };
    };
    return body;
  }

  it("runs AKRA to the analyst checkpoint through the Sectors adapter and orchestrator", async () => {
    const { id, snapshot, presentation } = await startRun();

    expect(snapshot.state).toBe("awaiting_analyst");
    expect(snapshot.plan?.steps.length).toBeGreaterThan(0);
    expect(snapshot.collected?.evidence.length).toBe(3);
    expect(snapshot.collected?.evidence.every((item) => item.cacheStatus === "miss")).toBe(true);
    expect(snapshot.forensics?.cfoToNi.status).toBe("clear");
    expect(snapshot.forensics?.receivablesDivergence.status).toBe("flagged");
    expect(presentation.suggestedHaircut).toBe(0.15);
    expect(id).toBeTruthy();
  });

  it("records the analyst decision and exports a workbook with the identical haircut", async () => {
    const { id } = await startRun();
    const decisionResponse = await decisionRoute(
      new Request("http://localhost/api/research/x/decision", { method: "POST", body: JSON.stringify({ action: "edit", finalHaircut: 0.25, rationale: "Conservative scenario" }) }),
      { params: Promise.resolve({ id }) },
    );
    expect(decisionResponse.status).toBe(200);
    const decisionBody = (await decisionResponse.json()) as {
      snapshot: { state: string; analystDecision: { action: string; finalHaircut: number }; valuation: { fairValuePerShare: number } };
      presentation: { reverseDcf: { impliedTerminalGrowth: number } | null };
    };
    expect(decisionBody.snapshot.state).toBe("exporting");
    expect(decisionBody.snapshot.analystDecision).toMatchObject({ action: "edit", finalHaircut: 0.25 });
    expect(decisionBody.snapshot.valuation.fairValuePerShare).toBeGreaterThan(0);
    expect(decisionBody.presentation.reverseDcf).not.toBeNull();
    expect(decisionBody.presentation.reverseDcf!.impliedTerminalGrowth).toBeGreaterThan(0.1);

    const workbookResponse = await workbookRoute(new Request("http://localhost/api/research/x/workbook?haircut=0.99"), { params: Promise.resolve({ id }) });
    expect(workbookResponse.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(await workbookResponse.arrayBuffer()) as never);
    const assumptions = workbook.getWorksheet("Assumptions")!;
    const dcf = workbook.getWorksheet("DCF")!;
    expect(assumptions.getCell("B5").value).toBe(0.25);
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
});