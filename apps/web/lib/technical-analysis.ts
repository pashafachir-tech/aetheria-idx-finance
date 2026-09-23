export interface PricePoint {
  date: string;
  close: number;
  volume: number;
}

export interface PriceSeries {
  symbol: string;
  currency: string;
  points: PricePoint[];
}

export type Trend = "bullish" | "bearish" | "sideways";
export type MarkerType = "positive" | "negative" | "neutral";

export interface ChartMarker {
  date: string;
  price: number;
  type: MarkerType;
  label: string;
}

export interface TechnicalAnalysis {
  summary: { trend: Trend; insight_text: string };
  chart_markers: ChartMarker[];
}

export const TECHNICAL_SYSTEM_PROMPT = `Kamu adalah arsitek intelijen finansial dan analis kuantitatif. Tugasmu menganalisis raw market data (harga dan volume) dari Sectors API dan mengonversinya menjadi Technical Analysis yang ringkas.
Identifikasi tren utama dan temukan 1-3 titik anomali/momentum (misal: lonjakan volume, penembusan resistance) untuk dijadikan 'marker' pada chart. Buat narasi insight maksimal 2 kalimat.

Kamu WAJIB merespons dalam format JSON persis seperti skema berikut:
{
  "summary": {
    "trend": "bullish | bearish | sideways",
    "insight_text": "string"
  },
  "chart_markers": [
    {
      "date": "YYYY-MM-DD",
      "price": 0.00,
      "type": "positive | negative | neutral",
      "label": "string"
    }
  ]
}`;

export function buildTechnicalPrompt(series: PriceSeries): string {
  const rows = series.points.map((point) => `${point.date},${point.close},${point.volume}`).join("\n");
  return `${TECHNICAL_SYSTEM_PROMPT}\n\nRaw market data (${series.symbol}, ${series.currency}) — CSV: date,close,volume\n${rows}`;
}

export function parseTechnicalAnalysis(raw: unknown, series: PriceSeries): TechnicalAnalysis | null {
  const source = asRecord(raw);
  if (!source) return null;
  const summary = asRecord(source.summary);
  if (!summary) return null;

  const trend = summary.trend;
  if (trend !== "bullish" && trend !== "bearish" && trend !== "sideways") return null;
  const insight = typeof summary.insight_text === "string" ? summary.insight_text.trim() : "";
  if (!insight) return null;

  const rawMarkers = Array.isArray(source.chart_markers) ? source.chart_markers : [];
  const markers = rawMarkers
    .map((marker) => normalizeMarker(marker, series))
    .filter((marker): marker is ChartMarker => marker !== null)
    .slice(0, 3);

  return { summary: { trend, insight_text: insight.slice(0, 320) }, chart_markers: markers };
}

function normalizeMarker(raw: unknown, series: PriceSeries): ChartMarker | null {
  const source = asRecord(raw);
  if (!source) return null;
  const date = typeof source.date === "string" ? source.date.trim() : "";
  const point = series.points.find((candidate) => candidate.date === date);
  if (!point) return null;
  const type: MarkerType = source.type === "positive" || source.type === "negative" || source.type === "neutral" ? source.type : "neutral";
  const rawPrice = typeof source.price === "number" && Number.isFinite(source.price) ? source.price : point.close;
  const price = Math.abs(rawPrice - point.close) <= point.close * 0.02 ? rawPrice : point.close;
  const label = typeof source.label === "string" && source.label.trim() ? source.label.trim().slice(0, 80) : `${type} marker`;
  return { date, price, type, label };
}

export function fallbackTechnicalAnalysis(series: PriceSeries): TechnicalAnalysis {
  const points = series.points;
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return { summary: { trend: "sideways", insight_text: `${series.symbol} tidak memiliki data harga yang cukup untuk dianalisis.` }, chart_markers: [] };
  const change = (last.close - first.close) / first.close;
  const trend: Trend = change > 0.02 ? "bullish" : change < -0.02 ? "bearish" : "sideways";
  const markers = computeDeterministicMarkers(points);
  const trendWord = trend === "bullish" ? "menguat" : trend === "bearish" ? "melemah" : "bergerak sideways";
  const insight = `${series.symbol} ${trendWord} ${(change * 100).toFixed(1)}% sepanjang periode dengan ${markers.length} titik momentum terdeteksi dari volume dan level resistance.`;
  return { summary: { trend, insight_text: insight }, chart_markers: markers };
}

export function computeDeterministicMarkers(points: PricePoint[]): ChartMarker[] {
  if (points.length < 3) return [];
  const markers: ChartMarker[] = [];

  const averageVolume = points.reduce((sum, point) => sum + point.volume, 0) / points.length;
  const spikeIndex = points.reduce((best, point, index) => (point.volume > points[best].volume ? index : best), 0);
  const spike = points[spikeIndex];
  const previous = points[spikeIndex - 1];
  if (spike.volume > averageVolume * 1.4) {
    markers.push({ date: spike.date, price: spike.close, type: previous && spike.close >= previous.close ? "positive" : "negative", label: `Lonjakan volume ${(spike.volume / 1e6).toFixed(1)}jt` });
  }

  let runningMax = points[0].close;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].close > runningMax) {
      markers.push({ date: points[index].date, price: points[index].close, type: "positive", label: "Penembusan resistance" });
      break;
    }
    runningMax = Math.max(runningMax, points[index].close);
  }

  let worstIndex = -1;
  let worstChange = 0;
  for (let index = 1; index < points.length; index += 1) {
    const change = (points[index].close - points[index - 1].close) / points[index - 1].close;
    if (change < worstChange) {
      worstChange = change;
      worstIndex = index;
    }
  }
  if (worstIndex > 0 && worstChange < -0.005) {
    markers.push({ date: points[worstIndex].date, price: points[worstIndex].close, type: "negative", label: `Koreksi ${(worstChange * 100).toFixed(1)}%` });
  }

  const seen = new Set<string>();
  return markers.filter((marker) => {
    if (seen.has(marker.date)) return false;
    seen.add(marker.date);
    return true;
  }).slice(0, 3);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}