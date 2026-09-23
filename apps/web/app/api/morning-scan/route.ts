import { getOrFetchMorningIntelligence } from "../../../lib/market-intelligence";

export const dynamic = "force-dynamic";

/** Aetheria institutional telemetry headers */
function aetheriaHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Aetheria-Kernel": "zero-llm-deterministic",
    "X-Sectors-Lineage": "v2-audited",
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    const data = await getOrFetchMorningIntelligence(forceRefresh);

    return Response.json(
      {
        success: true,
        timestamp: data.timestamp || new Date().toISOString(),
        generatedAt: data.generatedAt || new Date().toISOString(),
        expiresAt: data.expiresAt,
        ttlHours: data.ttlHours || 6,
        source: data.source,
        totalUniverseScanned: data.totalUniverseScanned || 902,
        macroSummary: data.macroSummary,
        idxMarketSummary: data.idxMarketSummary,
        catalysts: data.catalysts,
        sectorCatalysts: data.catalysts,
        candidates: data.leaders,
        leaders: data.leaders,
        items: data.items || data.leaders,
        presets: data.strategyPresets,
        strategyPresets: data.strategyPresets,
      },
      { headers: aetheriaHeaders() }
    );
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

    return Response.json(
      {
        success: true,
        timestamp: data.timestamp || new Date().toISOString(),
        generatedAt: data.generatedAt || new Date().toISOString(),
        expiresAt: data.expiresAt,
        ttlHours: data.ttlHours || 6,
        source: data.source,
        totalUniverseScanned: data.totalUniverseScanned || 902,
        macroSummary: data.macroSummary,
        idxMarketSummary: data.idxMarketSummary,
        catalysts: data.catalysts,
        sectorCatalysts: data.catalysts,
        candidates: data.leaders,
        leaders: data.leaders,
        items: data.items || data.leaders,
        presets: data.strategyPresets,
        strategyPresets: data.strategyPresets,
      },
      { headers: aetheriaHeaders() }
    );
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
