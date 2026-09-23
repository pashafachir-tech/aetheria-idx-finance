import { getOrFetchMorningIntelligence } from "../../../lib/market-intelligence";

export const dynamic = "force-dynamic";

/** Aetheria institutional telemetry headers */
function aetheriaHeaders(): HeadersInit {
  return {
    "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
    "X-Aetheria-Kernel": "zero-llm-deterministic",
    "X-Sectors-Lineage": "v2-audited",
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    const data = await getOrFetchMorningIntelligence(forceRefresh);

    return Response.json(data, { headers: aetheriaHeaders() });
  } catch (err: any) {
    console.error(`[SECTORS API FAILED] /api/morning-scan GET:`, err?.message || err);
    return Response.json(
      {
        success: false,
        error: err?.message || "Gagal memproses pemindaian morning intelligence",
        badge: "DATA_SECTORS_UNAVAILABLE",
      },
      { status: 500, headers: aetheriaHeaders() }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const forceRefresh = Boolean(body?.refresh);

    const data = await getOrFetchMorningIntelligence(forceRefresh);

    return Response.json(data, { headers: aetheriaHeaders() });
  } catch (err: any) {
    console.error(`[SECTORS API FAILED] /api/morning-scan POST:`, err?.message || err);
    return Response.json(
      {
        success: false,
        error: err?.message || "Gagal memproses pemindaian morning intelligence",
        badge: "DATA_SECTORS_UNAVAILABLE",
      },
      { status: 500, headers: aetheriaHeaders() }
    );
  }
}
