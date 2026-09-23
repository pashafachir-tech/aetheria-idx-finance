import { beforeAll, describe, expect, it } from "vitest";
import {
  fallbackParseIntent,
  generateExecutiveSynthesis,
  generateExecutiveSynthesisWithMeta,
  parseWhatIfIntent,
  parseWhatIfIntentWithMeta,
} from "../apps/web/lib/gemini-service";

const synthesisInput = {
  ticker: "AKRA",
  marketPrice: 1525.5,
  fairValue: 941.109455,
  cfoNiRatios: [0.8571, 0.7959],
  receivablesDivergence: 1.9231,
  cashHaircut: 0.15,
  impliedGrowth: 0.0696545,
  historicalGrowth: 0.1,
};

describe("gemini copilot service", () => {
  beforeAll(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("falls back to a deterministic synthesis when no API key is configured", async () => {
    const result = await generateExecutiveSynthesisWithMeta(synthesisInput);
    expect(result.provider).toBe("fallback");
    expect(result.value).toContain("AKRA");
    expect(result.value).toContain("941");
    expect(result.value.split(/\s+/).length).toBeLessThanOrEqual(160);
    await expect(generateExecutiveSynthesis(synthesisInput)).resolves.toBe(result.value);
  });

  it("parses what-if intent deterministically without an API key", async () => {
    const result = await parseWhatIfIntentWithMeta("Simulasikan suku bunga naik jadi WACC 12% dan haircut kas 20%");
    expect(result.provider).toBe("fallback");
    expect(result.value.wacc).toBeCloseTo(0.12, 6);
    expect(result.value.cashHaircut).toBeCloseTo(0.2, 6);
    expect(result.value.terminalGrowth).toBeUndefined();
    await expect(parseWhatIfIntent("Turunkan terminal growth jadi 2.5%")).resolves.toEqual({ terminalGrowth: 0.025 });
  });

  it("ignores parameters that were not mentioned", () => {
    expect(fallbackParseIntent("WACC naik ke 11%")).toEqual({ wacc: 0.11 });
    expect(fallbackParseIntent("tanpa parameter apapun")).toEqual({});
  });
});