import { domainErrorResponse, getRun, buildPresentationForRun } from "../../../../lib/research-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const record = getRun(id);
    if (!record) return Response.json({ code: "INCOMPLETE_DATA", message: `Research run ${id} was not found.`, recovery: "Start a new research run and retry." }, { status: 404 });
    return Response.json({ id, snapshot: record.orchestrator.current, presentation: buildPresentationForRun(record) });
  } catch (error) {
    const { status, payload } = domainErrorResponse(error);
    return Response.json(payload, { status });
  }
}