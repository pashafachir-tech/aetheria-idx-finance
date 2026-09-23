import type { PriceSeries } from "./technical-analysis";
import akraPriceHistory from "../../../fixtures/akra/price-history.json";
import bbriPriceHistory from "../../../fixtures/bbri/price-history.json";

const SERIES_BY_TICKER: Record<string, PriceSeries> = {
  AKRA: akraPriceHistory.data as PriceSeries,
  BBRI: bbriPriceHistory.data as PriceSeries,
};

export function priceHistoryFor(ticker: string): PriceSeries | null {
  return SERIES_BY_TICKER[ticker.trim().toUpperCase()] ?? null;
}

export function supportedPriceHistoryTickers(): string[] {
  return Object.keys(SERIES_BY_TICKER);
}