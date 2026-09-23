import { generateExecutiveSynthesisWithMeta, type SynthesisInput } from "../../../../lib/gemini-service";
import { sanitizeNewsContext } from "../../../../../../packages/agent-orchestrator/src/news-sanitizer";

interface NewsLike {
  title?: unknown;
  aiSummary?: unknown;
  body?: unknown;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as (Partial<SynthesisInput> & { news?: unknown }) | null;
  if (!body || typeof body.ticker !== "string" || !body.ticker.trim()) {
    return Response.json({ code: "INVALID_PROVIDER_PAYLOAD", message: "A ticker is required to synthesize the research memo.", recovery: "Run the research workflow first, then retry the synthesis." }, { status: 400 });
  }
  const news = Array.isArray(body.news)
    ? (body.news as NewsLike[]).filter((item): item is { title: string; aiSummary: string; body: string } => typeof item?.title === "string" && typeof item?.aiSummary === "string" && typeof item?.body === "string")
    : [];
  const data: SynthesisInput = {
    ticker: body.ticker.trim().toUpperCase(),
    marketPrice: toNumber(body.marketPrice),
    fairValue: toNumber(body.fairValue),
    cfoNiRatios: Array.isArray(body.cfoNiRatios) ? body.cfoNiRatios.filter((value): value is number => typeof value === "number" && Number.isFinite(value)) : [],
    receivablesDivergence: toNumber(body.receivablesDivergence),
    cashHaircut: toNumber(body.cashHaircut),
    impliedGrowth: toNumber(body.impliedGrowth),
    historicalGrowth: toNumber(body.historicalGrowth),
    newsContext: news.length > 0 ? sanitizeNewsContext(news) : undefined,
  };
  const { value, provider } = await generateExecutiveSynthesisWithMeta(data);
  return Response.json({ synthesis: value, provider });
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}