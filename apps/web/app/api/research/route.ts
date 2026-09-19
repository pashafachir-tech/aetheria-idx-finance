import { domainErrorResponse, startResearch } from "../../../lib/research-service";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { ticker?: unknown } | null;
  const ticker = typeof body?.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  if (!/^[A-Z]{1,10}$/.test(ticker)) {
    return Response.json({ code: "INVALID_PROVIDER_PAYLOAD", message: "A valid IDX ticker is required.", recovery: "Provide a 1-10 letter IDX ticker such as AKRA." }, { status: 400 });
  }
  try {
    const result = await startResearch(ticker);
    return Response.json(result);
  } catch (error) {
    const { status, payload } = domainErrorResponse(error);
    return Response.json(payload, { status });
  }
}