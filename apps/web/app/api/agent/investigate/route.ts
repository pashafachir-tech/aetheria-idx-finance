import { NextRequest, NextResponse } from "next/server";
import { runAutonomousInvestigation } from "../../../../lib/agent-orchestrator";
import type { AgentAnalystFocus } from "../../../../lib/agent-types";

/** Aetheria institutional telemetry headers */
function aetheriaHeaders(): Record<string, string> {
  return {
    "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
    "X-Aetheria-Kernel": "zero-llm-deterministic",
    "X-Sectors-Lineage": "v2-audited",
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawTicker = searchParams.get("ticker") || "BBCA";
  const focus = (searchParams.get("focus") || "360_institutional") as AgentAnalystFocus;

  try {
    const report = await runAutonomousInvestigation(rawTicker, focus);
    return NextResponse.json(report, { status: 200, headers: aetheriaHeaders() });
  } catch (error) {
    console.error("[Agent Investigate API Error]:", error);
    return NextResponse.json(
      {
        code: "AGENT_EXECUTION_ERROR",
        message: error instanceof Error ? error.message : "Failed to run autonomous investigation.",
        ticker: rawTicker,
      },
      { status: 500, headers: aetheriaHeaders() }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawTicker = typeof body.ticker === "string" ? body.ticker : "BBCA";
    const focus = (typeof body.focus === "string" ? body.focus : "360_institutional") as AgentAnalystFocus;

    const report = await runAutonomousInvestigation(rawTicker, focus);
    return NextResponse.json(report, { status: 200, headers: aetheriaHeaders() });
  } catch (error) {
    console.error("[Agent Investigate API Error]:", error);
    return NextResponse.json(
      {
        code: "AGENT_EXECUTION_ERROR",
        message: error instanceof Error ? error.message : "Failed to run autonomous investigation.",
      },
      { status: 500, headers: aetheriaHeaders() }
    );
  }
}
