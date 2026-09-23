import { NextRequest, NextResponse } from "next/server";
import {
  getRun,
  startResearch,
  recordDecision,
  buildRunWorkbook,
  domainErrorResponse,
} from "../../../lib/research-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get("id");
  const tickerParam = searchParams.get("ticker");

  try {
    let runId = idParam;
    if (!runId && tickerParam) {
      const ticker = tickerParam.trim().toUpperCase();
      const result = await startResearch(ticker);
      runId = result.id;
    }

    if (!runId) {
      return NextResponse.json(
        { code: "INVALID_REQUEST", message: "Either 'id' or 'ticker' query parameter is required." },
        { status: 400 }
      );
    }

    let record = getRun(runId);
    if (!record) {
      return NextResponse.json(
        { code: "NOT_FOUND", message: `Research run ${runId} not found.` },
        { status: 404 }
      );
    }

    // Auto-record decision if currently in awaiting_analyst state so export can proceed cleanly
    const snapshot = record.orchestrator.current;
    if (snapshot.state === "awaiting_analyst") {
      const suggestedHaircut = snapshot.collected?.suggestedHaircut ?? 0.1;
      await recordDecision(runId, {
        action: "apply",
        finalHaircut: suggestedHaircut,
        rationale: "Automated institutional workbook export with model-prescribed haircut.",
      });
      record = getRun(runId)!;
    }

    const isFinancial =
      record.dataSource.modelApplicability?.coverage === "financial" ||
      record.dataSource.bankMetrics !== null;
    const modelType = isFinancial ? "rim" : "dcf";
    const workbookBytes = await buildRunWorkbook(runId);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `aetheria-${record.ticker.toLowerCase()}-${modelType}-${timestamp}.xlsx`;

    return new Response(workbookBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const { status, payload } = domainErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
