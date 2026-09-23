import { generateTechnicalAnalysisWithMeta } from "../../../lib/gemini-service";
import { priceHistoryFor, supportedPriceHistoryTickers } from "../../../lib/price-history";
import { fetchSectorsDailyCandles } from "../../../lib/market-intelligence";

export async function GET(request: Request) {
  const ticker = (new URL(request.url).searchParams.get("ticker") ?? "AKRA").trim().toUpperCase();
  if (!/^[A-Z]{1,10}$/.test(ticker)) {
    return Response.json({ code: "INVALID_PROVIDER_PAYLOAD", message: "A valid IDX ticker is required.", recovery: "Provide a 1-10 letter IDX ticker such as AKRA or BBRI." }, { status: 400 });
  }

  let series = priceHistoryFor(ticker);
  if (!series) {
    try {
      const candles = await fetchSectorsDailyCandles(ticker);
      if (candles && candles.length > 0) {
        series = {
          symbol: ticker,
          currency: "IDR",
          points: candles.map((c) => ({
            date: c.date,
            close: c.close,
            volume: c.volume,
          })),
        };
      }
    } catch {
      // ignore live fetch errors
    }
  }

  if (!series) {
    return Response.json({ code: "INCOMPLETE_DATA", message: `Price history is not bundled for ${ticker}.`, recovery: `Try one of: ${supportedPriceHistoryTickers().join(", ")}.` }, { status: 422 });
  }

  const { analysis, provider } = await generateTechnicalAnalysisWithMeta(series);
  return Response.json({ ticker, currency: series.currency, series: series.points, analysis, provider });
}