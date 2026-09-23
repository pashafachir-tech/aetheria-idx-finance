"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
export { TechnicalRadarChart } from "./components/technical-chart";

interface PricePoint {
  date: string;
  close: number;
  volume: number;
}

interface ChartMarker {
  date: string;
  price: number;
  type: "positive" | "negative" | "neutral";
  label: string;
}

interface TechnicalResponse {
  ticker: string;
  currency: string;
  series: PricePoint[];
  analysis: { summary: { trend: "bullish" | "bearish" | "sideways"; insight_text: string }; chart_markers: ChartMarker[] };
  provider: "gemini" | "fallback";
}

const MARKER_COLORS: Record<ChartMarker["type"], string> = {
  positive: "#10b981",
  negative: "#dc2626",
  neutral: "#94a3b8",
};

function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function TechnicalAnalysisChart({ ticker }: Readonly<{ ticker: string }>) {
  const [data, setData] = useState<TechnicalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/technical-analysis?ticker=${encodeURIComponent(ticker)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.message ?? "Technical analysis failed.");
        return body as TechnicalResponse;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Technical analysis failed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (loading) {
    return (
      <div className="ta-skeleton" aria-busy="true" aria-label="Memuat analisis teknis">
        <div className="ta-skeleton-chart" />
        <div className="ta-skeleton-line" />
        <div className="ta-skeleton-line short" />
      </div>
    );
  }

  if (error) return <div className="empty-state">{error}</div>;
  if (!data) return null;

  const { analysis } = data;

  return (
    <div className="ta-wrap">
      <div className="ta-head">
        <span className={`ta-trend ${analysis.summary.trend}`}>{analysis.summary.trend.toUpperCase()}</span>
        <span className="ta-provider">{data.provider === "gemini" ? "Gemini structured analysis" : "Deterministic fallback"}</span>
      </div>
      <div className="ta-chart">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data.series} margin={{ top: 16, right: 20, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(value) => String(value).slice(5)} minTickGap={24} />
            <YAxis tick={{ fontSize: 11 }} width={56} domain={["dataMin - 20", "dataMax + 20"]} tickFormatter={(value) => formatNumber(Number(value))} />
            <Tooltip formatter={(value) => `Rp ${formatNumber(Number(value), 1)}`} />
            <Line type="monotone" dataKey="close" name="Close" stroke="#1769e0" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            {analysis.chart_markers.map((marker) => (
              <ReferenceDot
                key={`${marker.date}-${marker.label}`}
                x={marker.date}
                y={marker.price}
                r={6}
                fill={MARKER_COLORS[marker.type]}
                stroke="#ffffff"
                strokeWidth={2}
                label={{ value: marker.label, position: "top", fontSize: 9, fill: "#475569" }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="ta-insight">{analysis.summary.insight_text}</p>
      <ul className="ta-legend">
        <li><span className="ta-dot positive" /> Positif</li>
        <li><span className="ta-dot negative" /> Negatif</li>
        <li><span className="ta-dot neutral" /> Netral</li>
      </ul>
    </div>
  );
}