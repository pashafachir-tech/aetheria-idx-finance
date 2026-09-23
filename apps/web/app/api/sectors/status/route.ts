import { loadAppEnv } from "../../../../lib/env-loader";

export async function GET() {
  const env = loadAppEnv();
  const hasApiKey = Boolean(env.SECTORS_API_KEY?.trim());
  const useFixtures = env.USE_FIXTURES === "true";
  const mode = hasApiKey && !useFixtures ? "live" : "fixture";
  const baseUrl = env.SECTORS_API_BASE_URL?.trim() || "https://api.sectors.app/v2/";

  return Response.json(
    {
      mode,
      hasApiKey,
      baseUrl,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
        "X-Aetheria-Kernel": "zero-llm-deterministic",
        "X-Sectors-Lineage": "v2-audited",
      },
    }
  );
}
