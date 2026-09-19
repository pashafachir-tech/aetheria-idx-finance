import { domainErrorResponse, buildRunWorkbook } from "../../../../../lib/research-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const workbook = await buildRunWorkbook(id);
    return new Response(workbook as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=aetheria-${id}.xlsx`,
      },
    });
  } catch (error) {
    const { status, payload } = domainErrorResponse(error);
    return Response.json(payload, { status });
  }
}