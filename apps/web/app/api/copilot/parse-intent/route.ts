import { parseWhatIfIntentWithMeta } from "../../../../lib/gemini-service";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
  if (!body || typeof body.query !== "string" || !body.query.trim()) {
    return Response.json({ code: "INVALID_PROVIDER_PAYLOAD", message: "A scenario description is required.", recovery: "Describe a what-if scenario such as \"WACC 12% and cash haircut 20%\"." }, { status: 400 });
  }
  const { value, provider } = await parseWhatIfIntentWithMeta(body.query.trim());
  return Response.json({ params: value, provider });
}