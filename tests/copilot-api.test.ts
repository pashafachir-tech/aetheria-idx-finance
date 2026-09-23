import { beforeAll, describe, expect, it } from "vitest";
import { POST as synthesisRoute } from "../apps/web/app/api/copilot/synthesis/route";
import { POST as parseIntentRoute } from "../apps/web/app/api/copilot/parse-intent/route";

describe("copilot API", () => {
  beforeAll(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("returns a fallback synthesis for a valid payload", async () => {
    const response = await synthesisRoute(new Request("http://localhost/api/copilot/synthesis", {
      method: "POST",
      body: JSON.stringify({ ticker: "AKRA", marketPrice: 1525.5, fairValue: 941.109455, cfoNiRatios: [0.8571, 0.7959], receivablesDivergence: 1.9231, cashHaircut: 0.15, impliedGrowth: 0.0696545, historicalGrowth: 0.1 }),
    }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { synthesis: string; provider: string };
    expect(typeof body.synthesis).toBe("string");
    expect(body.synthesis).toContain("AKRA");
    expect(body.provider).toBe("fallback");
  });

  it("parses a natural language what-if scenario", async () => {
    const response = await parseIntentRoute(new Request("http://localhost/api/copilot/parse-intent", {
      method: "POST",
      body: JSON.stringify({ query: "WACC 11%, terminal growth 3%, haircut kas 20%" }),
    }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { params: { wacc?: number; terminalGrowth?: number; cashHaircut?: number }; provider: string };
    expect(body.params.wacc).toBeCloseTo(0.11, 6);
    expect(body.params.terminalGrowth).toBeCloseTo(0.03, 6);
    expect(body.params.cashHaircut).toBeCloseTo(0.2, 6);
    expect(body.provider).toBe("fallback");
  });

  it("rejects invalid payloads", async () => {
    const badSynthesis = await synthesisRoute(new Request("http://localhost/api/copilot/synthesis", { method: "POST", body: JSON.stringify({}) }));
    expect(badSynthesis.status).toBe(400);
    const badParse = await parseIntentRoute(new Request("http://localhost/api/copilot/parse-intent", { method: "POST", body: JSON.stringify({ query: "" }) }));
    expect(badParse.status).toBe(400);
  });
});