import { domainErrorResponse, recordDecision } from "../../../../../lib/research-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { action?: unknown; finalHaircut?: unknown; rationale?: unknown } | null;
  const action = body?.action === "apply" || body?.action === "edit" || body?.action === "dismiss" ? body.action : null;
  if (!action) return Response.json({ code: "INVALID_PROVIDER_PAYLOAD", message: "A valid analyst action (apply, edit, dismiss) is required.", recovery: "Record an analyst decision with a supported action." }, { status: 400 });
  const finalHaircut = typeof body?.finalHaircut === "number" ? body.finalHaircut : undefined;
  const rationale = typeof body?.rationale === "string" ? body.rationale : undefined;
  try {
    const result = await recordDecision(id, { action, finalHaircut: finalHaircut ?? 0, rationale });
    return Response.json(result);
  } catch (error) {
    const { status, payload } = domainErrorResponse(error);
    return Response.json(payload, { status });
  }
}