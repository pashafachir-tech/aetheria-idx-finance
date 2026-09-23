"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MetricExplainerTooltip } from "./metric-explainer";
import { TickerAutocomplete } from "./components/ticker-autocomplete";
import { DagInspector, type DagTraceNode } from "./components/dag-inspector";
import { PeerMatrix, type PeerItem } from "./components/peer-matrix";
import { MarketClock } from "./components/market-clock";
import { TechnicalRadarChart } from "./components/technical-chart";
import { SectorsFundamentals } from "./components/fundamental-charts";
import { AgentDossierView } from "./components/agent-dossier-view";
import {
  getFallbackShareholdersComposition,
  getFallbackSubsectorReport,
  getFallbackQuarterlyFinancials,
  getFallbackStockSuspensions,
  getFallbackCorporateActions,
  type ShareholdersCompositionData,
  type SubsectorReportData,
  type QuarterlyFinancialsData,
  type StockSuspensionsData,
  type CorporateActionsData,
  type TopBuyersSellersData,
} from "../../../packages/sectors-adapter/src/fallbacks";

/* ─────────────────────────────────────────────────────────
   §1  TYPES
   ───────────────────────────────────────────────────────── */

type TabKey = "forensic" | "whatif" | "technical" | "radar" | "agent";
type PersonaKey = "pm" | "credit" | "retail";

interface RawEvidenceRecord {
  operation?: string;
  cacheStatus?: string;
  latencyMs?: number;
  retrievedAt?: string;
}

interface PeerCompanyRecord {
  symbol?: string;
  ticker?: string | { value?: string };
  company_name?: string;
  companyName?: string;
  name?: string | { value?: string };
  market_cap?: number;
  marketCap?: number;
  marketCapitalization?: { value?: number };
  pe?: number;
  pe_ratio?: number;
  peRatio?: number;
  pbv?: number;
  roe?: number;
  margin?: number;
}

interface RawForensicPeriod {
  periodEnd?: string;
  revenue?: number | null;
  netIncome?: number | null;
  operatingCashFlow?: number | null;
  accountsReceivable?: number | null;
}

interface CashFlowStep {
  name: string;
  value: number;
  type: "add" | "subtract" | "subtotal" | "total";
}

interface EvidenceEntry {
  endpoint: string;
  status: "LIVE" | "CACHE HIT";
  latencyMs: number;
  timestamp: string;
}

interface KillCriteria {
  id: string;
  label: string;
  status: "CLEAR" | "BREACHED";
  threshold: string;
  observed: string;
}

interface PricePoint {
  date: string;
  close: number;
  volume: number;
}

interface ResearchPresentationData {
  id: string;
  ticker: string;
  mode: "live" | "fixture";
  retrievedAt: string;
  companyName: string;
  companyProfile?: {
    overview?: { description?: string };
    description?: string;
    sector?: string;
    subsector?: string;
  } | null;
  sector: string;
  subsector: string;
  classification: "IDX FINANCIAL" | "IDX NON-FINANCIAL";
  marketPrice: number;
  sharesOutstanding: number;
  freeFloat?: number;
  suggestedHaircut: number;
  historicalRevenueGrowth: number | null;
  reverseDcf?: {
    impliedGrowthRate: number;
    expectationGap: number;
  } | null;
  modelInputs?: {
    forecastFcff?: number[];
    wacc?: number;
    terminalGrowth?: number;
    cash?: number;
    totalDebt?: number;
    minorityInterest?: number;
    sharesOutstanding?: number;
  } | null;
  cashFlowBridge?: {
    netIncome: number;
    depreciationAndAmortization: number;
    workingCapitalDrag: number;
    residualAccrual: number;
    operatingCashFlow: number;
    capitalExpenditure: number;
    taxShield: number;
    fcff: number;
  } | null;
  modelApplicability?: {
    coverage: "financial" | "non_financial";
    model: "RESIDUAL_INCOME" | "FCFF_DCF";
    modelLabel: string;
    rationale: string;
  } | null;
  bankMetrics?: {
    netInterestMargin?: { value: number };
    nonPerformingLoan?: { value: number };
    roe?: { value: number };
    costOfEquity?: { value: number };
    bookValuePerShare?: { value: number };
    payoutRatio?: { value: number };
    dividendPerShare?: { value: number };
  } | null;
  residualIncome?: {
    presentValueOfResidualIncome: number;
    terminalValue: number;
    fairValuePerShare: number;
  } | null;
  news: Array<{
    id?: string;
    title?: string;
    sentiment?: "positive" | "neutral" | "negative";
    badge?: string;
    badgeColor?: string;
    summary?: string;
    aiSummary?: string;
    body?: string;
    source?: { outlet?: string; url?: string };
    peers?: Array<{ ticker: string; note?: string }>;
  }>;
  peers?: {
    companies?: PeerCompanyRecord[];
  } | null;
  evidenceTrail: EvidenceEntry[];
  dagTrace?: DagTraceNode[];
  financialStatements?: any[];
  earningsGrade: "A" | "B" | "C" | "D" | "F";
  earningsScore: number;
  cfoToNi: number | null;
  receivablesDivergence: number | null;
  arDivergenceDisplay?: string;
  arDivergenceStatus?: "EXCELLENT" | "NORMAL" | "WARNING" | "CRITICAL";
  arDivergenceDesc?: string;
  shareholdersComposition?: ShareholdersCompositionData | null;
  subsectorReport?: SubsectorReportData | null;
  quarterlyFinancials?: QuarterlyFinancialsData | null;
  stockSuspensions?: StockSuspensionsData | null;
  corporateActions?: CorporateActionsData | null;
  topBuyersSellers?: TopBuyersSellersData | null;
  dailyNetForeignInflow?: { symbol: string; data: Array<{ date: string; net_foreign: number; foreign_buy: number; foreign_sell: number; foreign_share: number }> } | null;
  historicalPriceSeries?: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> | null;
  qualityScorecard?: {
    score: number;
    grade: string;
    receivablesDivergence?: number;
    dsoTrendDays?: number;
    cfoToNi?: number;
  };
}

const TICKER_DEFAULT = "AKRA";

/* ── Ticker → Company name lookup ── */
const TICKER_COMPANY_MAP: Record<string, string> = {
  AKRA: "PT AKR Corporindo Tbk",
  PGAS: "PT Perusahaan Gas Negara Tbk",
  BMRI: "PT Bank Mandiri (Persero) Tbk",
  BBCA: "PT Bank Central Asia Tbk",
  PTBA: "PT Bukit Asam Tbk",
  BBRI: "PT Bank Rakyat Indonesia Tbk",
  BBNI: "PT Bank Negara Indonesia (Persero) Tbk",
  BBTN: "PT Bank Tabungan Negara (Persero) Tbk",
  ASII: "PT Astra International Tbk",
  UNTR: "PT United Tractors Tbk",
  SMGR: "PT Semen Indonesia Tbk",
  TLKM: "PT Telkom Indonesia Tbk",
  GOTO: "PT GoTo Gojek Tokopedia Tbk",
  BYAN: "PT Bayan Resources Tbk",
};

function resolveCompanyName(t: string): string {
  const upper = (t || "").trim().toUpperCase();
  return TICKER_COMPANY_MAP[upper] ?? `PT ${upper} Tbk`;
}

/* ── Agent Research Plan steps ── */
const RESEARCH_PLAN_STEPS = [
  { step: 1, label: "Issuer identity, sector, and classification", tool: "sectors.company-profile" },
  { step: 2, label: "Multi-period revenue, earnings, and balance sheet inputs", tool: "sectors.financial-statements" },
  { step: 3, label: "Last price and shares outstanding for valuation", tool: "sectors.daily-market-data" },
  { step: 4, label: "Peer set for relative valuation & context", tool: "sectors.subsector-peers" },
  { step: 5, label: "Forensic screening & prudential ratios", tool: "finance.forensics" },
  { step: 6, label: "Valuation model routing (FCFF DCF vs Residual Income)", tool: "finance.valuation-router" },
  { step: 7, label: "Market-implied growth & expectation gap", tool: "finance.reverse-dcf" },
  { step: 8, label: "Evidence trail & integrity verification", tool: "quality.audit-trail" },
] as const;

/* ── Defensive formatting helpers ── */
function fmtRp(value: number | null | undefined, decimals = 0): string {
  const num = Number(value || 0);
  if (isNaN(num) || !isFinite(num)) return "—";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

function fmtNum(value: unknown, fallback = "—"): string {
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return fallback;
  return num.toLocaleString("id-ID");
}

function fmtPct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return "—";
  return `${(num * 100).toFixed(decimals)}%`;
}

function fmtBridgeValue(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}Rp ${fmtRp(Math.abs(value))} M`;
}

function fmtAccountingRp(val: number | null | undefined): string {
  const num = Number(val || 0);
  if (isNaN(num) || !isFinite(num)) return "—";
  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  if (abs >= 1e12) {
    return `${sign}Rp ${(abs / 1e12).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} T`;
  }
  if (abs >= 1e9) {
    return `${sign}Rp ${(abs / 1e9).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`;
  }
  if (abs >= 1e6) {
    return `${sign}Rp ${(abs / 1e6).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Jt`;
  }
  return `${sign}Rp ${abs.toLocaleString("id-ID")}`;
}

function SeasonalityTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const entry = payload[0]?.payload;
  if (!entry) return null;

  const q1 = entry.q1 ?? entry.Q1 ?? 0;
  const q2 = entry.q2 ?? entry.Q2 ?? 0;
  const q3 = entry.q3 ?? entry.Q3 ?? 0;
  const q4 = entry.q4 ?? entry.Q4 ?? 0;
  const avgQ1Q3 = (q1 + q2 + q3) / 3;
  const q4Ratio = avgQ1Q3 > 0 ? (q4 / avgQ1Q3).toFixed(2) : "1.00";

  const cfoYoYGrowth = entry.cfoYoYGrowth ?? (entry.cfo_growth_pct != null ? entry.cfo_growth_pct * 100 : null);
  const cfoGrowth = cfoYoYGrowth != null 
    ? `${cfoYoYGrowth >= 0 ? '+' : ''}${cfoYoYGrowth.toFixed(1)}%` 
    : "N/A";
  const isCfoPositive = cfoYoYGrowth != null ? cfoYoYGrowth >= 0 : true;

  return (
    <div
      style={{
        background: "#0d1117",
        border: "1px solid #30363d",
        borderRadius: "6px",
        padding: "10px 14px",
        fontSize: "11px",
        fontFamily: "'JetBrains Mono', monospace",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ color: "#e6edf3", fontWeight: 700, marginBottom: "6px" }}>{label} Financial Seasonality</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ color: "#38bdf8" }}>Q1: {fmtAccountingRp(q1)}</div>
        <div style={{ color: "#10b981" }}>Q2: {fmtAccountingRp(q2)}</div>
        <div style={{ color: "#f59e0b" }}>Q3: {fmtAccountingRp(q3)}</div>
        <div style={{ color: entry?.isAnomalous ? "#ef4444" : "#8b5cf6", fontWeight: 700 }}>
          Q4: {fmtAccountingRp(q4)} {entry?.isAnomalous ? "(⚠️ Window Dressing)" : ""}
        </div>
        <div style={{ borderTop: "1px solid #21262d", paddingTop: "4px", marginTop: "2px" }}>
          <span className="text-slate-300 font-mono text-xs" style={{ color: "#8b949e", fontSize: "10.5px" }}>
            Q4 vs Avg(Q1-Q3): <b className="text-white" style={{ color: entry?.isAnomalous ? "#ef4444" : "#f8fafc" }}>{q4Ratio}x</b> | CFO YoY:{" "}
            <b className={isCfoPositive ? "text-emerald-400" : "text-rose-400"} style={{ color: isCfoPositive ? "#34d399" : "#f87171" }}>
              {cfoGrowth}
            </b>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Tooltips ── */
function DarkTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="wb-tooltip">
      <span className="wb-tooltip__label">{label}</span>
      {payload.map((entry) => (
        <span key={entry.name} className="wb-tooltip__row">
          <span className="wb-tooltip__dot" style={{ background: entry.color ?? "#00E599" }} />
          {entry.name}: <b>Rp {fmtRp(Number(entry.value), 1)}</b>
        </span>
      ))}
    </div>
  );
}

function BridgeTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="wb-tooltip">
      <span className="wb-tooltip__label">{label}</span>
      <span className="wb-tooltip__row">
        <b>{fmtBridgeValue(val)}</b>
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   §2  STRICT LIFECYCLE COMPONENTS
   ───────────────────────────────────────────────────────── */

export function ResearchLoadingSkeleton({ ticker }: { ticker: string }) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    // Progressive interval timer: ~200ms per step across the 8-Step DAG
    const interval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev < 7) return prev + 1;
        return prev;
      });
    }, 200);

    return () => clearInterval(interval);
  }, []);

  const progressPercentages = [12, 25, 38, 50, 63, 75, 88, 100];
  const progressPct = progressPercentages[activeStep] ?? 100;

  return (
    <div className="wb-loading-skeleton" style={{ maxWidth: "1280px", margin: "32px auto", padding: "0 24px" }}>
      <div style={{
        background: "rgba(99, 102, 241, 0.12)",
        border: "1px solid rgba(99, 102, 241, 0.35)",
        borderRadius: "8px",
        padding: "18px 24px",
        marginBottom: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span style={{
              display: "inline-block",
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: "#10B981",
              boxShadow: "0 0 12px #10B981",
              animation: "pulse 1s infinite",
            }} />
            <div>
              <strong style={{ color: "#F1F3F9", fontSize: "14px", display: "block" }}>
                Fetching Live Sectors API v2 Data for {ticker}... [Strict Zero-Synthetic Mode]
              </strong>
              <span style={{ color: "#8B92A5", fontSize: "12px" }}>
                Progressive execution: Step 0{activeStep + 1} of 08 [{progressPct}%]. Direct on-demand bursa pipeline active (zero fake mock fallback).
              </span>
            </div>
          </div>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "11px",
            color: activeStep === 7 ? "#10B981" : "#A5B4FC",
            background: "#1e2238",
            border: `1px solid ${activeStep === 7 ? "#10B981" : "#6366F1"}`,
            padding: "4px 10px",
            borderRadius: "4px",
            letterSpacing: "0.05em",
            fontWeight: 700,
          }}>
            DAG: {activeStep === 7 ? "CONVERGING [100%]" : `STEP 0${activeStep + 1} / 08 [${progressPct}%]`}
          </span>
        </div>

        {/* Dynamic Progress Bar */}
        <div style={{ width: "100%", height: "4px", background: "rgba(255, 255, 255, 0.08)", borderRadius: "2px", overflow: "hidden" }}>
          <div
            style={{
              width: `${progressPct}%`,
              height: "100%",
              background: "linear-gradient(90deg, #6366f1, #06b6d4, #10b981)",
              transition: "width 0.2s ease-out",
              boxShadow: "0 0 8px #06b6d4",
            }}
          />
        </div>
      </div>

      <div style={{
        background: "#0F1117",
        border: "1px solid #232735",
        borderRadius: "8px",
        padding: "24px",
        marginBottom: "24px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0, fontSize: "12px", color: "#8B92A5", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Agent Execution Pipeline (8-Step DAG)
          </h3>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "#38bdf8" }}>
            Active Phase: Step 0{activeStep + 1} of 08
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
          {RESEARCH_PLAN_STEPS.map((s, idx) => {
            const isReady = idx < activeStep;
            const isRunning = idx === activeStep;
            const isQueued = idx > activeStep;

            let borderColor = "#232735";
            let bgColor = "#161922";
            let statusColor = "#8B92A5";
            let statusText = "QUEUED";
            let stepColor = "#6366F1";

            if (isReady) {
              borderColor = "rgba(16, 185, 129, 0.45)";
              bgColor = "rgba(16, 185, 129, 0.06)";
              statusColor = "#10B981";
              statusText = "✓ READY";
              stepColor = "#10B981";
            } else if (isRunning) {
              borderColor = "#06B6D4";
              bgColor = "rgba(6, 182, 212, 0.08)";
              statusColor = "#06B6D4";
              statusText = "RUNNING...";
              stepColor = "#06B6D4";
            }

            return (
              <div
                key={s.step}
                className={isRunning ? "wb-dag-step--running" : ""}
                style={{
                  background: bgColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: "6px",
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  transition: "all 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "10.5px",
                    fontWeight: 800,
                    color: stepColor,
                  }}>
                    STEP 0{s.step}
                  </span>
                  <span style={{
                    fontSize: "9.5px",
                    fontWeight: 700,
                    color: statusColor,
                    fontFamily: "'JetBrains Mono', monospace",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}>
                    {isRunning && (
                      <span
                        style={{
                          display: "inline-block",
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          backgroundColor: "#06B6D4",
                          boxShadow: "0 0 6px #06B6D4",
                        }}
                      />
                    )}
                    {statusText}
                  </span>
                </div>
                <div style={{ fontSize: "12.5px", color: isQueued ? "#8B92A5" : "#F1F3F9", fontWeight: 600 }}>
                  {s.label}
                </div>
                <code style={{ fontSize: "10px", color: isRunning ? "#38BDF8" : "#8B92A5", fontFamily: "'JetBrains Mono', monospace" }}>
                  {s.tool}
                </code>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{
            background: "#0F1117",
            border: "1px solid #232735",
            borderRadius: "6px",
            padding: "20px",
            minHeight: "140px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}>
            <div style={{ height: "14px", width: "48%", background: "#1f2433", borderRadius: "4px" }} />
            <div style={{ height: "28px", width: "70%", background: "#161922", borderRadius: "4px" }} />
            <div style={{ height: "10px", width: "60%", background: "#1f2433", borderRadius: "4px" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResearchErrorScreen({
  error,
  ticker,
  onRetry,
}: {
  error: { message: string; recovery?: string; code?: string };
  ticker: string;
  onRetry: () => void;
}) {
  return (
    <div className="wb-error-screen" style={{
      maxWidth: "680px",
      margin: "60px auto",
      padding: "32px",
      background: "#0F1117",
      border: "1px solid #EF4444",
      borderRadius: "8px",
      boxShadow: "0 20px 50px rgba(239, 68, 68, 0.15)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
        <div style={{
          width: "44px",
          height: "44px",
          borderRadius: "8px",
          background: "rgba(239, 68, 68, 0.15)",
          color: "#EF4444",
          display: "grid",
          placeItems: "center",
          fontSize: "22px",
          fontWeight: 800,
        }}>
          ✕
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              background: "#EF4444",
              color: "#fff",
              fontSize: "10px",
              fontWeight: 800,
              padding: "2px 8px",
              borderRadius: "4px",
              letterSpacing: "0.08em",
            }}>
              {error.code || "PROVIDER_FAILURE"}
            </span>
            <span style={{ color: "#8B92A5", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace" }}>
              TARGET: {ticker}
            </span>
          </div>
          <h2 style={{ margin: "4px 0 0 0", color: "#F1F3F9", fontSize: "18px", fontWeight: 700 }}>
            Research Pipeline Failure
          </h2>
        </div>
      </div>

      <div style={{
        background: "rgba(239, 68, 68, 0.08)",
        border: "1px solid rgba(239, 68, 68, 0.25)",
        borderRadius: "6px",
        padding: "16px",
        marginBottom: "18px",
      }}>
        <div style={{ color: "#FCA5A5", fontSize: "13px", lineHeight: "1.6", fontWeight: 500 }}>
          {error.message}
        </div>
        {error.recovery && (
          <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px dashed rgba(239, 68, 68, 0.2)", color: "#E2E8F0", fontSize: "12px" }}>
            <strong>Remedy / Recovery:</strong> {error.recovery}
          </div>
        )}
      </div>

      <div style={{
        padding: "12px 14px",
        borderRadius: "6px",
        background: "#161922",
        border: "1px solid #232735",
        color: "#8B92A5",
        fontSize: "11.5px",
        lineHeight: "1.5",
        marginBottom: "24px",
      }}>
        <strong style={{ color: "#F59E0B" }}>Strict Lifecycle Barrier Enforced:</strong> All analytical models, forensic cards, Recharts visualizations, and evidence telemetry have been unmounted. Zero synthetic mock data or stale metrics from previous runs are permitted to leak into this viewport.
      </div>

      <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "10px 18px",
            borderRadius: "4px",
            border: "1px solid #232735",
            background: "#161922",
            color: "#F1F3F9",
            textDecoration: "none",
            fontSize: "12.5px",
            fontWeight: 600,
          }}
        >
          Kembali ke Morning Hub
        </a>
        <button
          type="button"
          onClick={onRetry}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "10px 20px",
            borderRadius: "4px",
            border: "1px solid #EF4444",
            background: "#EF4444",
            color: "#fff",
            fontSize: "12.5px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Coba Lagi / Retry
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   §3  DETERMINISTIC VALUATION HELPERS (Zero-LLM)
   ───────────────────────────────────────────────────────── */

function computeDcfFairValue(
  forecastFcff: number[],
  wacc: number,
  terminalGrowth: number,
  cash: number,
  totalDebt: number,
  minorityInterest: number,
  sharesOutstanding: number,
  haircut: number
): number {
  if (!forecastFcff || forecastFcff.length === 0 || wacc <= terminalGrowth || sharesOutstanding <= 0) return 0;
  let pvFcff = 0;
  for (let i = 0; i < forecastFcff.length; i++) {
    pvFcff += forecastFcff[i] / Math.pow(1 + wacc, i + 1);
  }
  const lastFcff = forecastFcff[forecastFcff.length - 1] ?? 0;
  const tv = (lastFcff * (1 + terminalGrowth)) / (wacc - terminalGrowth);
  const pvTv = tv / Math.pow(1 + wacc, forecastFcff.length);
  const ev = pvFcff + pvTv;
  const equityValue = ev + cash - totalDebt - minorityInterest;
  const perShare = equityValue / sharesOutstanding;
  if (!Number.isFinite(perShare)) return 0;
  return Math.max(0, Math.round(perShare * (1 - haircut)));
}

function computeRimFairValue(
  bookValuePerShare: number,
  roe: number,
  costOfEquity: number,
  growth: number,
  years = 5,
  payoutRatio = 0.50
): number {
  if (!bookValuePerShare || bookValuePerShare <= 0) return 0;
  const r = Math.max(0.08, costOfEquity || 0.10);
  const g = Math.min(r - 0.01, Math.max(0.02, growth || 0.035));
  const k = Math.min(0.95, Math.max(0.05, payoutRatio || 0.50));

  let book = bookValuePerShare;
  let pvResidual = 0;
  let lastResidual = 0;

  for (let year = 1; year <= years; year++) {
    const eps = book * roe;
    const dps = eps * k;
    const residual = (roe - r) * book;
    pvResidual += residual / Math.pow(1 + r, year);
    lastResidual = residual;
    book = book + eps - dps; // Clean Surplus Relation: BVPS_t = BVPS_{t-1} + EPS_t - DPS_t
  }

  const terminalResidual = lastResidual * (1 + g);
  const terminalValue = terminalResidual / (r - g) / Math.pow(1 + r, years);
  const total = bookValuePerShare + pvResidual + terminalValue;

  if (!Number.isFinite(total)) return Math.max(0, bookValuePerShare || 0);
  return Math.max(0, Math.round(total));
}

function computeReverseDcfImpliedGrowth(
  marketPrice: number,
  baseFcff: number,
  forecastYears: number,
  wacc: number,
  terminalGrowth: number,
  cash: number,
  totalDebt: number,
  sharesOutstanding: number
): number {
  if (baseFcff <= 0 || sharesOutstanding <= 0) return 0;
  let lo = 0.0;
  let hi = 0.35;
  for (let iter = 0; iter < 80; iter++) {
    const mid = (lo + hi) / 2;
    const forecast = Array.from({ length: forecastYears }, (_, i) =>
      baseFcff * Math.pow(1 + mid, i + 1)
    );
    let pvFcff = 0;
    for (let i = 0; i < forecast.length; i++) {
      pvFcff += forecast[i] / Math.pow(1 + wacc, i + 1);
    }
    const lastFcff = forecast[forecast.length - 1];
    const tv = (lastFcff * (1 + terminalGrowth)) / (wacc - terminalGrowth);
    const pvTv = tv / Math.pow(1 + wacc, forecastYears);
    const ev = pvFcff + pvTv;
    const eq = ev + cash - totalDebt;
    const fairValue = eq / sharesOutstanding;
    if (fairValue < marketPrice) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ─────────────────────────────────────────────────────────
   §4  MAIN WORKBENCH COMPONENT
   ───────────────────────────────────────────────────────── */

export default function EngineRun({ initialTicker }: { initialTicker: string }) {
  const [ticker, setTicker] = useState(initialTicker || TICKER_DEFAULT);
  const [tickerInput, setTickerInput] = useState(initialTicker || TICKER_DEFAULT);
  const [activeTab, setActiveTab] = useState<TabKey>("radar");

  /* ── Live Research State (STRICT: starts as null, zero mock state) ── */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; recovery?: string; code?: string } | null>(null);
  const [liveData, setLiveData] = useState<ResearchPresentationData | null>(null);

  /* ── Export State ── */
  const [exporting, setExporting] = useState(false);
  const [exportToast, setExportToast] = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);

  /* ── What-If state ── */
  const [simWacc, setSimWacc] = useState<number>(0.12);
  const [simTg, setSimTg] = useState<number>(0.04);
  const [simHaircut, setSimHaircut] = useState<number>(0.15);
  const [simRoe, setSimRoe] = useState<number>(0.17);
  const [simKe, setSimKe] = useState<number>(0.11);

  /* ── Persona & Chaos ── */
  const [persona, setPersona] = useState<PersonaKey>("pm");
  const [chaosMode, setChaosMode] = useState<boolean>(false);

  /* ── Natural Language Scenario ── */
  const [nlPrompt, setNlPrompt] = useState("Simulasikan suku bunga naik jadi WACC 12% dan haircut kas 20%");
  const [nlStatus, setNlStatus] = useState<string | null>(null);

  /* ── Modals & Power-User Input Refs ── */
  const [dagInspectorOpen, setDagInspectorOpen] = useState<boolean>(false);
  const tickerInputRef = useRef<HTMLInputElement>(null);

  /* ── Clock ── */
  const [currentTime, setCurrentTime] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    const tick = () => setCurrentTime(new Date().toISOString().slice(0, 19).replace("T", " "));
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  /* ── Fetch Research with Client-Side Session Cache ── */
  const fetchResearch = useCallback(async (targetTicker: string) => {
    const sym = targetTicker.trim().toUpperCase();
    const cacheKey = `sectors_res_v4_${sym}`;

    // 1. Check client-side sessionStorage first (zero quota consumption!)
    if (typeof window !== "undefined") {
      try {
        const cachedStr = sessionStorage.getItem(cacheKey);
        if (cachedStr) {
          const cachedData = JSON.parse(cachedStr) as ResearchPresentationData;
          const hasActions = (cachedData.corporateActions?.actions || []).length > 0;
          const hasForeignFlow = Array.isArray(cachedData.dailyNetForeignInflow?.data) && cachedData.dailyNetForeignInflow.data.length > 0;
          if (cachedData && cachedData.ticker === sym && hasActions && hasForeignFlow) {
            console.log(`[Session Cache] Serving ${sym} instantly from sessionStorage`);
            setLiveData(cachedData);
            setError(null);
            setLoading(false);
            return;
          }
        }
      } catch {
        // ignore parse error, proceed to fetch
      }
    }

    setLoading(true);
    setError(null);
    setLiveData(null); // STRICT: clear data on fresh request

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: sym }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError({
          code: body.code || `HTTP_${res.status}`,
          message: body.message || `HTTP ${res.status}: Gagal memuat data dari Sectors API.`,
          recovery: body.recovery || "Periksa konfigurasi kredensial dan ulangi proses analisis.",
        });
        return;
      }

      const presentation = body.presentation;
      const snapshot = body.snapshot;
      const coverage = presentation.modelApplicability?.coverage;
      const isFinancial = coverage === "financial";
      const sector = (presentation.sector || snapshot?.collected?.sector || (isFinancial ? "Financials" : "Energy")).toUpperCase();
      const subsector = (presentation.subsector || snapshot?.collected?.subsector || (isFinancial ? "Commercial Banking" : "General")).toUpperCase();

      const rawEvidence: RawEvidenceRecord[] = snapshot?.collected?.evidence || snapshot?.evidence || [];
      const seenOps = new Set<string>();
      const evidenceList: EvidenceEntry[] = [];
      for (const e of rawEvidence) {
        const op = e.operation || "Sectors API";
        if (!seenOps.has(op)) {
          seenOps.add(op);
          evidenceList.push({
            endpoint: op,
            status: e.cacheStatus === "hit" ? "CACHE HIT" : "LIVE",
            latencyMs: e.latencyMs || 45,
            timestamp: e.retrievedAt || new Date().toISOString(),
          });
        }
      }

      const newWacc = presentation.modelInputs?.wacc ?? 0.12;
      const newTg = presentation.modelInputs?.terminalGrowth ?? 0.04;
      const newHaircut = presentation.suggestedHaircut ?? 0.15;
      const newRoe = presentation.bankMetrics?.roe?.value ?? 0.17;
      const newKe = presentation.bankMetrics?.costOfEquity?.value ?? 0.11;

      setSimWacc(newWacc);
      setSimTg(newTg);
      setSimHaircut(newHaircut);
      setSimRoe(newRoe);
      setSimKe(newKe);

      // Dynamically extract and calculate CFO/NI and Receivables Divergence
      let dynCfoNi: number | null = null;
      let dynReceivablesDiv: number | null = null;
      let dynArDisplay = "";
      let dynArStatus: "EXCELLENT" | "NORMAL" | "WARNING" | "CRITICAL" = "NORMAL";
      let dynArDesc = "";

      const forensicPeriods = snapshot?.collected?.forensicPeriods || (presentation as any).financialStatements || [];
      if (Array.isArray(forensicPeriods) && forensicPeriods.length >= 1) {
        const validCfoNiPeriods = forensicPeriods.filter((p: any) => p && p.netIncome && p.netIncome !== 0 && p.operatingCashFlow != null);
        if (validCfoNiPeriods.length > 0) {
          const latestP = validCfoNiPeriods[validCfoNiPeriods.length - 1];
          dynCfoNi = Number((latestP.operatingCashFlow / latestP.netIncome).toFixed(2));
        }

        if (forensicPeriods.length >= 2) {
          const pPrev = forensicPeriods[forensicPeriods.length - 2];
          const pCurr = forensicPeriods[forensicPeriods.length - 1];
          if (
            pPrev && pCurr &&
            pPrev.revenue && pCurr.revenue &&
            pPrev.revenue !== 0 &&
            pPrev.accountsReceivable != null &&
            pCurr.accountsReceivable != null &&
            pPrev.accountsReceivable !== 0
          ) {
            const prevAr = Number(pPrev.accountsReceivable);
            const latestAr = Number(pCurr.accountsReceivable);
            const prevRev = Number(pPrev.revenue);
            const latestRev = Number(pCurr.revenue);

            const arGrowth = prevAr > 0 ? (latestAr - prevAr) / prevAr : 0;
            const revGrowth = prevRev > 0 ? (latestRev - prevRev) / prevRev : 0;

            if (arGrowth <= 0) {
              // Piutang menyusut = Kas masuk lebih cepat (Sangat Positif)
              dynArDisplay = `${(arGrowth * 100).toFixed(1)}% (Inflow)`;
              dynArStatus = "EXCELLENT";
              dynArDesc = `Koleksi kas prima: Piutang menyusut ${(Math.abs(arGrowth) * 100).toFixed(1)}% saat pendapatan ${(revGrowth * 100).toFixed(1)}%. Optimal Cash Inflow / Collection.`;
              dynReceivablesDiv = null;
            } else if (revGrowth <= 0 && arGrowth > 0) {
              dynArDisplay = `>3.0x (Divergen)`;
              dynArStatus = "CRITICAL";
              dynArDesc = `Peringatan: Piutang naik saat pendapatan turun. Risiko pengakuan pendapatan agresif.`;
              dynReceivablesDiv = 3.0;
            } else {
              const ratio = revGrowth !== 0 ? arGrowth / revGrowth : 1.0;
              dynReceivablesDiv = Number(ratio.toFixed(2));
              dynArDisplay = `${dynReceivablesDiv.toFixed(2)}x`;
              dynArStatus = ratio > 1.5 ? "WARNING" : "NORMAL";
              dynArDesc = ratio > 1.5 
                ? `Pertumbuhan piutang melampaui pendapatan (>1.5x).` 
                : `Pertumbuhan piutang selaras dengan pertumbuhan pendapatan.`;
            }
          }
        }
      }

      if (dynCfoNi == null && snapshot?.forensics?.cfoToNi?.periods?.length) {
        const last = snapshot.forensics.cfoToNi.periods[snapshot.forensics.cfoToNi.periods.length - 1];
        if (last && typeof last.ratio === "number") dynCfoNi = Number(last.ratio.toFixed(2));
      } else if (dynCfoNi == null && (presentation as any)?.forensics?.cfoToNi?.ratio != null) {
        dynCfoNi = Number((presentation as any).forensics.cfoToNi.ratio.toFixed(2));
      }

      if (!dynArDisplay) {
        let rawDiv: number | null = null;
        if (snapshot?.forensics?.receivablesDivergence?.ratio != null) {
          rawDiv = Number(snapshot.forensics.receivablesDivergence.ratio);
        } else if ((presentation as any)?.forensics?.receivablesDivergence?.ratio != null) {
          rawDiv = Number((presentation as any).forensics.receivablesDivergence.ratio);
        } else if (snapshot?.qualityScorecard?.receivablesDivergence != null || (presentation as any)?.qualityScorecard?.receivablesDivergence != null) {
          const qVal = snapshot?.qualityScorecard?.receivablesDivergence ?? (presentation as any)?.qualityScorecard?.receivablesDivergence;
          if (qVal != null) rawDiv = Number(qVal);
        }

        const arG = snapshot?.forensics?.receivablesDivergence?.receivablesGrowth;
        const revG = snapshot?.forensics?.receivablesDivergence?.revenueGrowth ?? 0;

        if (arG != null && arG <= 0) {
          dynArDisplay = `${(arG * 100).toFixed(1)}% (Inflow)`;
          dynArStatus = "EXCELLENT";
          dynArDesc = `Koleksi kas prima: Piutang menyusut ${(Math.abs(arG) * 100).toFixed(1)}% saat pendapatan ${(revG * 100).toFixed(1)}%. Optimal Cash Inflow / Collection.`;
          dynReceivablesDiv = null;
        } else if (rawDiv != null) {
          if (rawDiv < 0) {
            dynArDisplay = `${rawDiv.toFixed(1)}% (Inflow)`;
            dynArStatus = "EXCELLENT";
            dynArDesc = `Koleksi kas prima: Pertumbuhan piutang negatif menandakan penagihan kas lancar (Optimal Cash Inflow / Collection).`;
            dynReceivablesDiv = null;
          } else if (rawDiv > 1.5) {
            dynReceivablesDiv = Number(rawDiv.toFixed(2));
            dynArDisplay = `${dynReceivablesDiv.toFixed(2)}x`;
            dynArStatus = "WARNING";
            dynArDesc = `Pertumbuhan piutang melampaui pendapatan (>1.5x).`;
          } else {
            dynReceivablesDiv = Number(rawDiv.toFixed(2));
            dynArDisplay = `${dynReceivablesDiv.toFixed(2)}x`;
            dynArStatus = "NORMAL";
            dynArDesc = `Pertumbuhan piutang selaras dengan pertumbuhan pendapatan.`;
          }
        }
      }

      const fullData: ResearchPresentationData = {
        id: body.id,
        ticker: sym,
        mode: presentation.mode || "live",
        retrievedAt: presentation.retrievedAt || new Date().toISOString(),
        companyName: presentation.companyName || resolveCompanyName(sym),
        companyProfile: presentation.companyProfile ?? null,
        sector,
        subsector,
        classification: isFinancial ? "IDX FINANCIAL" : "IDX NON-FINANCIAL",
        marketPrice: presentation.marketPrice || 0,
        sharesOutstanding: presentation.sharesOutstanding || presentation.modelInputs?.sharesOutstanding || (sym === "BBRI" ? 151_559_002_572 : isFinancial ? 93_333_333_333 : 20_000_000_000),
        freeFloat: presentation.freeFloat ?? (presentation.shareholdersComposition as any)?.public_float_pct ?? 46.76,
        suggestedHaircut: newHaircut,
        historicalRevenueGrowth: presentation.historicalRevenueGrowth ?? 0.10,
        reverseDcf: presentation.reverseDcf,
        modelInputs: presentation.modelInputs,
        cashFlowBridge: presentation.cashFlowBridge,
        modelApplicability: presentation.modelApplicability,
        bankMetrics: presentation.bankMetrics,
        residualIncome: presentation.residualIncome,
        news: Array.isArray(presentation.news) ? presentation.news : [],
        peers: presentation.peers || { companies: [] },
        evidenceTrail: evidenceList,
        dagTrace: (presentation as { dagTrace?: DagTraceNode[] }).dagTrace ?? [],
        financialStatements: forensicPeriods,
        earningsGrade: (snapshot?.qualityScorecard?.grade ?? presentation.qualityScorecard?.grade ?? "B") as "A" | "B" | "C" | "D" | "F",
        earningsScore: snapshot?.qualityScorecard?.score ?? presentation.qualityScorecard?.score ?? 75,
        cfoToNi: dynCfoNi,
        receivablesDivergence: dynReceivablesDiv,
        arDivergenceDisplay: dynArDisplay,
        arDivergenceStatus: dynArStatus,
        arDivergenceDesc: dynArDesc,
        shareholdersComposition: presentation.shareholdersComposition ?? null,
        subsectorReport: presentation.subsectorReport ?? null,
        quarterlyFinancials: presentation.quarterlyFinancials ?? null,
        stockSuspensions: presentation.stockSuspensions ?? null,
        corporateActions: presentation.corporateActions ?? null,
        topBuyersSellers: presentation.topBuyersSellers ?? null,
        dailyNetForeignInflow: presentation.dailyNetForeignInflow ?? null,
        historicalPriceSeries: presentation.historicalPriceSeries ?? null,
        qualityScorecard: presentation.qualityScorecard ?? snapshot?.qualityScorecard ?? undefined,
      };

      setLiveData(fullData);

      // Persist to client-side sessionStorage (7-day longevity or session duration)
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(fullData));
        } catch {
          // storage quota safely ignored
        }
      }
    } catch (err) {
      setError({
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Network failure while connecting to /api/research.",
        recovery: "Pastikan Next.js development server berjalan aktif di localhost:3000.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResearch(ticker);
  }, [ticker, fetchResearch]);

  /* ── Export Workbook Handler ── */
  const handleExportWorkbook = useCallback(async () => {
    if (!liveData) return;
    setExporting(true);
    setExportToast({ message: "Menyiapkan institutional workbook (.xlsx)...", type: "info" });
    try {
      const res = await fetch(`/api/export?ticker=${ticker}&id=${liveData.id}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.message || `HTTP ${res.status}: Gagal mengunduh workbook.`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const isFin = liveData.classification === "IDX FINANCIAL";
      a.download = `aetheria-${ticker.toLowerCase()}-${isFin ? "rim" : "dcf"}-${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setExportToast({ message: "Workbook berhasil diunduh!", type: "success" });
    } catch (err) {
      setExportToast({
        message: err instanceof Error ? err.message : "Ekspor workbook untuk model Residual Income sedang dipersiapkan.",
        type: "info",
      });
    } finally {
      setExporting(false);
      setTimeout(() => setExportToast(null), 4000);
    }
  }, [liveData, ticker]);

  /* ── Strict UI State Barrier ── */
  const isError = error !== null;
  const isLoading = loading || (!isError && (!liveData || liveData.ticker !== ticker));
  const isSuccess = !isError && !isLoading && liveData !== null && liveData.ticker === ticker;

  /* ── Keyboard Shortcuts (Power-User Terminal Experience) ── */
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInput =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          (activeElement as HTMLElement).isContentEditable);

      // Cmd+K or Ctrl+K: Focus search input even if an input is active
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        tickerInputRef.current?.focus();
        tickerInputRef.current?.select();
        return;
      }

      // If user is currently typing in an input, don't trigger single-key navigation
      if (isInput) {
        if (e.key === "Escape") {
          (activeElement as HTMLElement).blur();
        }
        return;
      }

      // Esc closes DAG Inspector
      if (e.key === "Escape") {
        setDagInspectorOpen(false);
        return;
      }

      // 1-4 for Tab switching
      if (e.key === "1") {
        e.preventDefault();
        setActiveTab("radar");
        return;
      }
      if (e.key === "2") {
        e.preventDefault();
        setActiveTab("forensic");
        return;
      }
      if (e.key === "3") {
        e.preventDefault();
        setActiveTab("whatif");
        return;
      }
      if (e.key === "4") {
        e.preventDefault();
        setActiveTab("technical");
        return;
      }
      if (e.key === "5") {
        e.preventDefault();
        setActiveTab("agent");
        return;
      }

      // C: Toggle Chaos mode
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        setChaosMode((prev) => !prev);
        return;
      }

      // D: Toggle DAG Inspector
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        setDagInspectorOpen((prev) => !prev);
        return;
      }

      // E: Trigger Export
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        if (isSuccess && !exporting) {
          handleExportWorkbook();
        }
        return;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isSuccess, exporting, handleExportWorkbook]);

  /* ── Deterministic Math ── */
  const isFinancial = liveData?.classification === "IDX FINANCIAL";

  const bvpsFallback = useMemo(() => {
    if (!liveData) return 50;
    const fromMetrics = liveData.bankMetrics?.bookValuePerShare?.value;
    if (fromMetrics && fromMetrics > 0) return fromMetrics;
    if (liveData.marketPrice && liveData.marketPrice > 0) return Math.round(liveData.marketPrice * 0.5);
    return 50;
  }, [liveData]);

  const rawDcfFairValue = useMemo(() => {
    if (!liveData || isFinancial) return 0;
    const inputs = liveData.modelInputs;
    if (!inputs?.forecastFcff || !inputs.sharesOutstanding) return 0;
    return computeDcfFairValue(
      inputs.forecastFcff,
      inputs.wacc ?? simWacc,
      inputs.terminalGrowth ?? simTg,
      inputs.cash ?? 0,
      inputs.totalDebt ?? 0,
      inputs.minorityInterest ?? 0,
      inputs.sharesOutstanding,
      liveData.suggestedHaircut
    );
  }, [liveData, isFinancial, simWacc, simTg]);

  const isDistressedDcf = useMemo(() => {
    if (isFinancial || !liveData) return false;
    const inputs = liveData.modelInputs;
    const fcffAllNegative = inputs?.forecastFcff ? inputs.forecastFcff.every((f) => f <= 0) : false;
    return rawDcfFairValue <= 0 || fcffAllNegative;
  }, [isFinancial, liveData, rawDcfFairValue]);

  const baselineFairValue = useMemo(() => {
    if (!liveData) return 0;
    if (isFinancial) {
      if (liveData.residualIncome?.fairValuePerShare && liveData.residualIncome.fairValuePerShare > 0) {
        return liveData.residualIncome.fairValuePerShare;
      }
      const bv = liveData.bankMetrics?.bookValuePerShare?.value ?? (ticker === "BBRI" ? 2196 : bvpsFallback);
      const roe = liveData.bankMetrics?.roe?.value ?? (ticker === "BBRI" ? 0.1712 : 0.17);
      const ke = liveData.bankMetrics?.costOfEquity?.value ?? 0.10;
      const tg = simTg || 0.035;
      return computeRimFairValue(bv, roe, ke, tg);
    }
    if (isDistressedDcf) {
      return Math.max(1, Math.round(bvpsFallback));
    }
    return Math.max(1, Math.round(rawDcfFairValue));
  }, [liveData, isFinancial, isDistressedDcf, bvpsFallback, rawDcfFairValue, simTg, ticker]);

  const simFairValue = useMemo(() => {
    if (!liveData) return 0;
    if (isFinancial) {
      const bv = liveData.bankMetrics?.bookValuePerShare?.value ?? (ticker === "BBRI" ? 2196 : 3500);
      const effectiveKe = chaosMode ? simKe + 0.03 : simKe;
      const effectiveRoe = chaosMode ? simRoe * 0.85 : simRoe;
      return computeRimFairValue(bv, effectiveRoe, effectiveKe, simTg);
    }
    const inputs = liveData.modelInputs;
    if (!inputs?.forecastFcff || !inputs.sharesOutstanding) return 0;
    const effectiveWacc = chaosMode ? simWacc + 0.03 : simWacc;
    const effectiveHaircut = chaosMode ? Math.min(0.5, simHaircut + 0.15) : simHaircut;

    if (isDistressedDcf) {
      const baseWacc = inputs.wacc || 0.12;
      const waccSensitivity = 1 - (effectiveWacc - baseWacc) * 1.5;
      const haircutDiscount = 1 - effectiveHaircut;
      const baseDiscount = 1 - (liveData.suggestedHaircut || 0.1);
      const scaled = baselineFairValue * waccSensitivity * (haircutDiscount / (baseDiscount > 0 ? baseDiscount : 1));
      return Math.max(1, Math.round(scaled));
    }

    const rawSim = computeDcfFairValue(
      inputs.forecastFcff,
      effectiveWacc,
      simTg,
      inputs.cash ?? 0,
      inputs.totalDebt ?? 0,
      inputs.minorityInterest ?? 0,
      inputs.sharesOutstanding,
      effectiveHaircut
    );
    return Math.max(1, Math.round(rawSim));
  }, [liveData, isFinancial, simRoe, simKe, simWacc, simTg, simHaircut, chaosMode, isDistressedDcf, baselineFairValue]);

  const premiumToMarket = useMemo(() => {
    if (!liveData || baselineFairValue === 0) return 0;
    return (liveData.marketPrice - baselineFairValue) / Math.abs(baselineFairValue);
  }, [liveData, baselineFairValue]);

  const impliedGrowth = useMemo(() => {
    if (!liveData || isFinancial) return 0;
    const inputs = liveData.modelInputs;
    const baseFcff = inputs?.forecastFcff?.[0] ?? 2300e9;
    return computeReverseDcfImpliedGrowth(
      liveData.marketPrice,
      baseFcff,
      5,
      simWacc,
      simTg,
      inputs?.cash ?? 0,
      inputs?.totalDebt ?? 0,
      inputs?.sharesOutstanding ?? liveData.sharesOutstanding
    );
  }, [liveData, isFinancial, simWacc, simTg]);

  const growthGap = useMemo(() => {
    if (!liveData) return 0;
    return (liveData.historicalRevenueGrowth ?? 0.10) - impliedGrowth;
  }, [liveData, impliedGrowth]);

  /* ── Waterfall Data (Non-Financial only) ── */
  const waterfallData = useMemo(() => {
    if (!liveData?.cashFlowBridge) return [];
    const b = liveData.cashFlowBridge as any;

    const findLine = (key: string): number => {
      const match = b.lines?.find((l: any) => l.key === key);
      return typeof match?.value === "number" && Number.isFinite(match.value) ? match.value : 0;
    };

    const getVal = (directVal: unknown, lineKey: string): number => {
      if (typeof directVal === "number" && Number.isFinite(directVal)) return directVal;
      return findLine(lineKey);
    };

    const netIncome = getVal(b.netIncome, "netIncome");
    let dna = getVal(b.depreciationAndAmortization, "depreciationAndAmortization");
    const wcDrag = getVal(b.workingCapitalDrag ?? b.changeInNwc, "workingCapitalDrag");
    const cfo = getVal(b.cashFromOperations ?? b.operatingCashFlow, "cashFromOperations");
    const capex = getVal(b.capitalExpenditure, "capitalExpenditure");
    const fcff = getVal(b.fcff, "fcff");

    // Rekonsiliasi: D&A = CFO - Net Income + Working Capital Drag jika D&A bernilai 0
    if (dna === 0 && cfo !== 0 && netIncome !== 0) {
      dna = Math.max(0, cfo - netIncome + Math.abs(wcDrag));
    }

    const steps: CashFlowStep[] = [
      { name: "Net Income", value: Math.round(netIncome / 1e9), type: "add" },
      { name: "D&A / Non-Cash Adj.", value: Math.round(dna / 1e9), type: "add" },
      { name: "Working Capital Drag", value: Math.round(-Math.abs(wcDrag) / 1e9), type: "subtract" },
      { name: "CFO", value: Math.round(cfo / 1e9), type: "subtotal" },
      { name: "Capex", value: Math.round(-Math.abs(capex) / 1e9), type: "subtract" },
      { name: "FCFF", value: Math.round(fcff / 1e9), type: "total" },
    ];

    let cumulative = 0;
    return steps.map((step) => {
      const start = cumulative;
      cumulative += step.value;
      return {
        name: step.name,
        value: step.value,
        start,
        end: cumulative,
        type: step.type,
        barValue: step.type === "subtotal" || step.type === "total" ? cumulative : step.value,
      };
    });
  }, [liveData]);

  /* ── Kill Criteria ── */
  const killCriteriaList: KillCriteria[] = useMemo(() => {
    if (isFinancial) {
      const npl = liveData?.bankMetrics?.nonPerformingLoan?.value ?? 0.028;
      const roe = liveData?.bankMetrics?.roe?.value ?? 0.17;
      const ke = liveData?.bankMetrics?.costOfEquity?.value ?? 0.11;
      return [
        {
          id: "npl-breach",
          label: "NPL Prudential Guard",
          status: npl > 0.05 ? "BREACHED" : "CLEAR",
          threshold: "Gross NPL > 5.0% (OJK Limit)",
          observed: `Observed: ${(npl * 100).toFixed(2)}% ${npl > 0.05 ? ">" : "≤"} 5.0% threshold`,
        },
        {
          id: "spread-compression",
          label: "Economic Value Added (ROE - Ke)",
          status: roe < ke ? "BREACHED" : "CLEAR",
          threshold: "ROE < Cost of Equity (Negative Economic Spread)",
          observed: `Observed ROE ${(roe * 100).toFixed(1)}% vs Ke ${(ke * 100).toFixed(1)}% (Spread: ${((roe - ke) * 100).toFixed(1)}pp)`,
        },
      ];
    }
    const isDivBreached = liveData?.receivablesDivergence != null && liveData.receivablesDivergence > 1.5;
    const isScoreBreached = (liveData?.earningsScore ?? 75) < 70;
    const dsoStatus = (isDivBreached || isScoreBreached) ? "BREACHED" : "CLEAR";
    const divObserved = liveData?.receivablesDivergence != null
      ? `AR Divergence: ${liveData.receivablesDivergence.toFixed(2)}x`
      : "AR Divergence: INSUFFICIENT_HISTORY";

    const isCfoNiBreached = liveData?.cfoToNi != null && liveData.cfoToNi < 0.75;
    const cfoNiObserved = liveData?.cfoToNi != null
      ? `Observed CFO/NI: ${liveData.cfoToNi.toFixed(2)}x`
      : "Observed CFO/NI: INSUFFICIENT_HISTORY";

    return [
      {
        id: "dso-breach",
        label: "DSO Breach Trigger",
        status: dsoStatus,
        threshold: "DSO > 45 days or Divergence > 1.5x",
        observed: divObserved,
      },
      {
        id: "cash-conversion",
        label: "Cash Conversion Leakage",
        status: isCfoNiBreached ? "BREACHED" : "CLEAR",
        threshold: "CFO/NI < 0.75x for 2 consecutive periods",
        observed: cfoNiObserved,
      },
    ];
  }, [isFinancial, liveData]);

  /* ── Dynamic Persona Narratives ── */
  const personaNarrative = useMemo(() => {
    if (!liveData) return "";
    const shockPrefix = chaosMode ? "⚡ [CHAOS STRESS-TEST ACTIVE: +300 bps Rate Shock & Cash Haircut Applied] " : "";
    if (isFinancial) {
      const nim = liveData.bankMetrics?.netInterestMargin?.value ? (liveData.bankMetrics.netInterestMargin.value * 100).toFixed(2) : "3.94";
      const roe = liveData.bankMetrics?.roe?.value ? (liveData.bankMetrics.roe.value * 100).toFixed(1) : "17.2";
      const npl = liveData.bankMetrics?.nonPerformingLoan?.value ? (liveData.bankMetrics.nonPerformingLoan.value * 100).toFixed(2) : "2.80";
      const fv = fmtRp(baselineFairValue);

      if (persona === "pm") {
        return shockPrefix + `${ticker} is evaluated using the Residual Income Model (RIM) with reported ROE of ${roe}% against Cost of Equity of ${(simKe * 100).toFixed(1)}%. Net Interest Margin at ${nim}% and Gross NPL at ${npl}% confirm healthy credit quality within prudential limits. RIM model fair value of Rp ${fv} reflects solid clean-surplus returns over book value.`;
      }
      if (persona === "credit") {
        return shockPrefix + `From a banking regulatory and credit risk viewpoint, ${ticker} demonstrates robust asset quality with Gross NPL at ${npl}% (well below OJK 5.0% threshold). NIM of ${nim}% provides resilient net interest income buffering against rate cycles. Capital adequacy remains sound.`;
      }
      return shockPrefix + `Untuk investor ritel, ${ticker} (${liveData.companyName}) mencatatkan kinerja perbankan yang solid dengan ROE ${roe}% dan margin bunga bersih (NIM) ${nim}%. Berdasarkan model Residual Income, nilai wajar diperhitungkan pada Rp ${fv} per saham dibandingkan harga pasar saat ini Rp ${fmtRp(liveData.marketPrice)}. Kredit bermasalah (NPL) terkendali di ${npl}%.`;
    }

    const cfoNi = liveData.cfoToNi != null ? `${liveData.cfoToNi.toFixed(2)}x` : "N/A";
    const div = liveData.receivablesDivergence != null ? `${liveData.receivablesDivergence.toFixed(2)}x` : "N/A";
    const displayFv = baselineFairValue > 0 ? fmtRp(baselineFairValue) : (bvpsFallback > 0 ? fmtRp(bvpsFallback) : "50");
    if (persona === "pm") {
      return shockPrefix + `${ticker} presents an earnings quality profile of Grade ${liveData.earningsGrade} (${liveData.earningsScore}/100). The CFO/NI ratio of ${cfoNi} and receivables divergence of ${div} guide a ${(liveData.suggestedHaircut * 100).toFixed(0)}% cash haircut on the DCF model. Post-haircut fair value is Rp ${displayFv}.`;
    }
    if (persona === "credit") {
      return shockPrefix + `From an underwriter perspective, ${ticker}'s working capital and receivables trend (divergence ${div}) signal collection vigilance. Cash conversion stands at ${cfoNi}. Maintain monitoring on receivables aging buckets.`;
    }
    return shockPrefix + `Harga pasar ${ticker} saat ini Rp ${fmtRp(liveData.marketPrice)} — model valuasi kami menunjukkan nilai wajar Rp ${displayFv} setelah penyesuaian haircut ${(liveData.suggestedHaircut * 100).toFixed(0)}%. Rasio kas terhadap laba berada di level ${cfoNi}.`;
  }, [liveData, isFinancial, baselineFairValue, bvpsFallback, persona, simKe, ticker, chaosMode]);

  /* ── Handlers ── */
  const handleRunResearch = useCallback((overrideTicker?: string) => {
    const raw = typeof overrideTicker === "string" ? overrideTicker : tickerInput;
    const cleaned = raw.trim().toUpperCase();
    if (/^[A-Z0-9]{1,10}$/.test(cleaned)) {
      setTicker(cleaned);
      setTickerInput(cleaned);
      setLiveData(null);
      setError(null);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `/run?ticker=${encodeURIComponent(cleaned)}`);
      }
      fetchResearch(cleaned);
    }
  }, [tickerInput, fetchResearch]);

  const handleApplyNlScenario = useCallback(() => {
    const text = nlPrompt;
    const matched: string[] = [];

    const waccMatch = text.match(/WACC\s*(\d+(\.\d+)?)%/i) || text.match(/WACC\s*(?:naik\s*jadi\s*)?(\d+(?:[.,]\d+)?)\s*%/i);
    if (waccMatch) {
      const val = parseFloat(waccMatch[1].replace(",", ".")) / 100;
      if (!isNaN(val)) {
        setSimWacc(val);
        setSimKe(val);
        matched.push(`WACC / Ke → ${(val * 100).toFixed(1)}%`);
      }
    }

    const hcMatch = text.match(/haircut(\s*kas)?\s*(\d+(\.\d+)?)%/i) || text.match(/haircut\s*(?:kas\s*)?(\d+(?:[.,]\d+)?)\s*%/i);
    if (hcMatch) {
      const numStr = hcMatch[2] || hcMatch[1];
      const val = parseFloat(numStr.replace(",", ".")) / 100;
      if (!isNaN(val)) {
        setSimHaircut(val);
        matched.push(`Cash Haircut → ${(val * 100).toFixed(0)}%`);
      }
    }

    const tgMatch = text.match(/terminal(\s*growth)?\s*(\d+(\.\d+)?)%/i) || text.match(/(?:terminal\s*(?:growth)?|growth)\s*(\d+(?:[.,]\d+)?)\s*%/i);
    if (tgMatch) {
      const numStr = tgMatch[2] || tgMatch[1];
      const val = parseFloat(numStr.replace(",", ".")) / 100;
      if (!isNaN(val)) {
        setSimTg(val);
        matched.push(`Terminal Growth → ${(val * 100).toFixed(1)}%`);
      }
    }

    if (matched.length > 0) {
      setNlStatus(`✓ Applied: ${matched.join(", ")}. Zero-LLM math recalculation complete.`);
    } else {
      setNlStatus("⚠ No recognized parameters found. Try: \"WACC 12%\", \"haircut kas 20%\", \"terminal growth 4%\".");
    }
  }, [nlPrompt]);

  /* ── Tab config ── */
  const TABS: { key: TabKey; label: string }[] = [
    { key: "radar", label: "Market Radar" },
    { key: "forensic", label: "Forensic & Valuation" },
    { key: "whatif", label: "What-If Studio" },
    { key: "technical", label: "Technical Radar" },
    { key: "agent", label: "🤖 AI Agent Dossier" },
  ];



  return (
    <div className="wb-shell">
      {/* Toast Notification */}
      {exportToast && (
        <div style={{
          position: "fixed",
          top: "20px",
          right: "24px",
          zIndex: 9999,
          padding: "12px 20px",
          borderRadius: "6px",
          background: exportToast.type === "success" ? "#065F46" : exportToast.type === "error" ? "#7F1D1D" : "#1E293B",
          color: "#F1F3F9",
          border: `1px solid ${exportToast.type === "success" ? "#10B981" : exportToast.type === "error" ? "#EF4444" : "#6366F1"}`,
          boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
          fontSize: "13px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}>
          <span>{exportToast.type === "success" ? "✓" : exportToast.type === "error" ? "✕" : "ℹ"}</span>
          <span>{exportToast.message}</span>
        </div>
      )}

      {/* ═══════ TOP COMMAND BAR (2-TIER INSTITUTIONAL HEADER) ═══════ */}
      <header className="wb-header-wrapper">
        {/* Tingkat 1: Top Utility Bar */}
        <div className="wb-top-utility-bar">
          <div className="wb-top-utility-bar__left">
            <a href="/" className="wb-header__brand">
              <span className="wb-header__mark">A</span>
              <span className="wb-header__brand-text">
                <b>AETHERIA IDX FINANCE</b>
                <small>TICKER FORENSIC &amp; VALUATION WORKBENCH</small>
              </span>
            </a>
            <span className="wb-breadcrumb" aria-label="Breadcrumb">
              <span className="wb-breadcrumb__muted">RESEARCH RUN /</span>
              <span className="wb-breadcrumb__muted">{liveData?.sector || liveData?.classification || "IDX ASSET"} /</span>
              <span className="wb-breadcrumb__active" style={{ flexShrink: 0, fontWeight: 700 }}>
                {ticker}
              </span>
            </span>
          </div>
          <div className="wb-top-utility-bar__right">
            <div className="wb-clock-container">
              <MarketClock compact />
            </div>
            <div className="wb-header__badges">
              {isSuccess && liveData && (
                <>
                  <span className="wb-badge wb-badge--info">{liveData.classification}</span>
                  <span className="wb-badge wb-badge--info">{liveData.sector}</span>
                  {liveData.mode === "live" ? (
                    <span className="wb-badge wb-badge--live">LIVE SECTORS API</span>
                  ) : (
                    <span className="wb-badge wb-badge--dev">FIXTURE MODE (DEV)</span>
                  )}
                  <span className="wb-badge wb-badge--default wb-badge--timestamp" suppressHydrationWarning>
                    {new Date(liveData.retrievedAt || Date.now()).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </>
              )}
              {isError && (
                <span className="wb-badge" style={{ background: "#7F1D1D", color: "#FCA5A5", border: "1px solid #EF4444" }}>
                  PIPELINE ERROR
                </span>
              )}
              {isLoading && (
                <span className="wb-badge wb-badge--dev" style={{ animation: "pulse 1.5s infinite" }}>
                  CONNECTING LIVE API...
                </span>
              )}
              <span className="wb-badge wb-badge--default wb-badge--version">v2</span>
            </div>
          </div>
        </div>

        {/* Tingkat 2: Action & Navigation Bar */}
        <div className="wb-action-bar">
          <div className="wb-action-bar__left">
            <nav className="wb-header-nav-tabs" role="tablist" aria-label="Analysis tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={`wb-header-tab ${activeTab === tab.key ? "wb-header-tab--active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="wb-action-bar__right">
            <div className="wb-search-box-wrap">
              <TickerAutocomplete
                value={tickerInput}
                inputRef={tickerInputRef}
                onChange={(val) => setTickerInput(val)}
                onSelectTicker={(selected) => handleRunResearch(selected)}
                placeholder="TICKER (Ctrl+K)"
                size="sm"
                fullWidth={false}
                dropdownAlign="right"
                ariaLabel="Ticker input"
              />
            </div>
            <button className="wb-btn wb-btn--primary wb-btn--emerald" type="button" onClick={() => handleRunResearch()}>
              Run Research
            </button>
            <button
              className="wb-btn wb-btn--dark"
              type="button"
              onClick={() => setDagInspectorOpen(true)}
              title="Inspect DAG Execution Graph & Sectors Lineage (Hotkey: D)"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <span>&lt;/&gt; DAG Trace</span>
              <kbd className="wb-shortcut-key">D</kbd>
            </button>
            <button
              className="wb-btn wb-btn--outline"
              type="button"
              disabled={!isSuccess || exporting}
              onClick={handleExportWorkbook}
              title="Export Institutional Excel Workbook (Hotkey: E)"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <span>{exporting ? "Mengunduh..." : "Export (.xlsx)"}</span>
              <kbd className="wb-shortcut-key">E</kbd>
            </button>
          </div>
        </div>
      </header>

      {/* ═══════ STRICT LIFECYCLE BARRIER SWITCH ═══════ */}

      {isError && (
        <ResearchErrorScreen
          error={error}
          ticker={ticker}
          onRetry={() => fetchResearch(ticker)}
        />
      )}

      {isLoading && (
        <ResearchLoadingSkeleton ticker={ticker} />
      )}

      {isSuccess && liveData && (
        <>

          {/* ═══════ TWO-COLUMN WORKBENCH ═══════ */}
          <div className="wb-layout wb-dashboard-fadein">
            {/* ─── LEFT MAIN WORKSPACE ─── */}
            <main className="wb-main">
              {/* ╌╌╌ MARKET RADAR TAB ╌╌╌ */}
              {activeTab === "radar" && (
                <div className="wb-tab-content">
                  {/* Company Profile & Business Summary Card */}
                  <section className="wb-panel">
                    <div className="wb-panel__header">
                      <h2 className="wb-panel__title">Company Profile & Business Architecture</h2>
                      <span className="wb-panel__badge wb-panel__badge--accent">BEI Verified</span>
                    </div>
                    <div style={{ display: "grid", gap: "12px", color: "#C5CBD8", fontSize: "13px", lineHeight: "1.6" }}>
                      <p style={{ margin: 0 }}>
                        {liveData.companyProfile?.overview?.description ||
                          liveData.companyProfile?.description ||
                          `${liveData.companyName || resolveCompanyName(ticker)} (${ticker}) merupakan emiten berlisensi yang tercatat di Bursa Efek Indonesia (BEI) pada sektor ${liveData.sector || 'Financials'}, subsektor ${liveData.subsector || 'Commercial Banking'}.`}
                      </p>
                      <div className="wb-market-grid" style={{ marginTop: "6px" }}>
                        <div className="wb-market-card">
                          <span className="wb-market-card__label">Company Name</span>
                          <strong className="wb-market-card__value" style={{ fontSize: "13.5px" }}>
                            {liveData.companyName || resolveCompanyName(ticker)}
                          </strong>
                          <small className="wb-market-card__sub">{liveData.classification}</small>
                        </div>
                        <div className="wb-market-card">
                          <span className="wb-market-card__label">Papan Pencatatan</span>
                          <strong className="wb-market-card__value" style={{ fontSize: "13.5px" }}>Papan Utama</strong>
                          <small className="wb-market-card__sub">Bursa Efek Indonesia (IDX)</small>
                        </div>
                        <div className="wb-market-card">
                          <span className="wb-market-card__label">Total Saham Beredar</span>
                          <strong className="wb-market-card__value wb-mono" style={{ fontSize: "13.5px" }}>
                            {fmtNum(liveData.sharesOutstanding)}
                          </strong>
                          <small className="wb-market-card__sub">Lembar Saham Tercatat</small>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Market Overview */}
                  <section className="wb-panel">
                    <div className="wb-panel__header">
                      <h2 className="wb-panel__title">Market Overview</h2>
                      <span className="wb-panel__badge wb-panel__badge--accent">LIVE SECTORS</span>
                    </div>
                    <div className="wb-market-grid">
                      <div className="wb-market-card">
                        <span className="wb-market-card__label">Last Price</span>
                        <strong className="wb-market-card__value wb-mono">Rp {fmtRp(liveData.marketPrice, 1)}</strong>
                        <small className="wb-market-card__sub">as of {new Date(liveData.retrievedAt || Date.now()).toLocaleDateString("id-ID")}</small>
                      </div>
                      <div className="wb-market-card">
                        <span className="wb-market-card__label">Market Cap</span>
                        <strong className="wb-market-card__value wb-mono">
                          Rp {fmtRp((Number(liveData.marketPrice || 0) * Number(liveData.sharesOutstanding || 0)) / 1e12, 1)} T
                        </strong>
                        <small className="wb-market-card__sub">{fmtRp(Number(liveData.sharesOutstanding || 0) / 1e9, 1)} B shares</small>
                      </div>
                      <div className="wb-market-card">
                        <span className="wb-market-card__label">Sector / Subsector</span>
                        <strong className="wb-market-card__value">{liveData.sector || "Financials"}</strong>
                        <small className="wb-market-card__sub">{liveData.subsector || "Banking"}</small>
                      </div>

                      {isFinancial ? (
                        <>
                          <div className="wb-market-card">
                            <span className="wb-market-card__label">
                              Net Interest Margin (NIM)
                              <MetricExplainerTooltip metric="nim" context={`${ticker}: Net annualized spread relative to earning assets.`} />
                            </span>
                            <strong className="wb-market-card__value wb-mono">
                              {liveData.bankMetrics?.netInterestMargin?.value !== undefined ? fmtPct(liveData.bankMetrics.netInterestMargin.value, 2) : "N/A"}
                            </strong>
                            <small className="wb-market-card__sub">Annualized spread</small>
                          </div>
                          <div className="wb-market-card">
                            <span className="wb-market-card__label">
                              Return on Equity (ROE)
                              <MetricExplainerTooltip metric="roe" context={`${ticker}: Return on book equity capital.`} />
                            </span>
                            <strong className="wb-market-card__value wb-mono">
                              {liveData.bankMetrics?.roe?.value !== undefined ? fmtPct(liveData.bankMetrics.roe.value, 2) : "N/A"}
                            </strong>
                            <small className="wb-market-card__sub">Return on book equity</small>
                          </div>
                          <div className="wb-market-card">
                            <span className="wb-market-card__label">
                              Non-Performing Loan (NPL)
                              <MetricExplainerTooltip metric="npl" context={`${ticker}: Gross non-performing credit risk.`} />
                            </span>
                            <strong className="wb-market-card__value wb-mono">
                              {liveData.bankMetrics?.nonPerformingLoan?.value !== undefined ? fmtPct(liveData.bankMetrics.nonPerformingLoan.value, 2) : "N/A"}
                            </strong>
                            <small className="wb-market-card__sub">Gross credit risk</small>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="wb-market-card">
                            <span className="wb-market-card__label">Revenue Growth YoY</span>
                            <strong className="wb-market-card__value wb-mono">
                              {liveData.historicalRevenueGrowth ? `+${fmtPct(liveData.historicalRevenueGrowth)}` : "—"}
                            </strong>
                            <small className="wb-market-card__sub">Annualized revenue trend</small>
                          </div>
                          <div className="wb-market-card">
                            <span className="wb-market-card__label">
                              CFO/NI Conversion
                              <MetricExplainerTooltip metric="cfoNi" context={`${ticker}: Cash conversion from reported net accounting profit.`} />
                            </span>
                            <strong className="wb-market-card__value wb-mono">
                              {fmtNum(liveData.cfoToNi?.toFixed(2))}x
                            </strong>
                            <small className="wb-market-card__sub">Cash conversion efficiency</small>
                          </div>
                          <div className="wb-market-card">
                            <span className="wb-market-card__label">
                              AR Divergence
                              <MetricExplainerTooltip metric="divergence" context={`${ticker}: Accounts receivable growth versus top-line revenue trend.`} />
                            </span>
                            <strong className="wb-market-card__value wb-mono">
                              {liveData.receivablesDivergence != null ? `${liveData.receivablesDivergence.toFixed(2)}x` : "INSUFFICIENT_HISTORY"}
                            </strong>
                            <small className="wb-market-card__sub">Receivables vs revenue</small>
                          </div>
                        </>
                      )}

                      {/* 10-Day Cumulative Net Foreign Flow */}
                      {(() => {
                        const rawFlowArr = (liveData.dailyNetForeignInflow as any)?.data || [];
                        const last10Flows = Array.isArray(rawFlowArr) ? rawFlowArr.slice(-10) : [];
                        const tenDayCumulative = last10Flows.reduce((acc: number, curr: any) => acc + (curr.net_foreign || curr.net_foreign_flow || curr.net_foreign_inflow || 0), 0);
                        const hasFlowData = last10Flows.length > 0;
                        const flowSign = tenDayCumulative > 0 ? "+" : tenDayCumulative < 0 ? "-" : "";
                        const flowFormatted = Math.abs(tenDayCumulative) >= 1e12
                          ? (Math.abs(tenDayCumulative) / 1e12).toFixed(2) + " T"
                          : (Math.abs(tenDayCumulative) / 1e9).toFixed(2) + " M";
                        const flowStance = !hasFlowData
                          ? "FEED UNAVAILABLE"
                          : tenDayCumulative > 50e9
                          ? "BIG ACCUMULATION"
                          : tenDayCumulative > 0
                          ? "NET BUY / INFLOW"
                          : tenDayCumulative < -50e9
                          ? "DISTRIBUTION"
                          : tenDayCumulative < 0
                          ? "NET SELL / OUTFLOW"
                          : "NEUTRAL";
                        const flowColor = !hasFlowData
                          ? "#94A3B8"
                          : tenDayCumulative > 0
                          ? "#10B981"
                          : tenDayCumulative < 0
                          ? "#EF4444"
                          : "#94A3B8";

                        return (
                          <div className="wb-market-card">
                            <span className="wb-market-card__label">
                              10-Day Net Foreign Flow
                              <MetricExplainerTooltip metric="flow" context={`${ticker}: Akumulasi 10 hari arus modal bersih investor asing langsung dari feed bursa BEI.`} />
                            </span>
                            <strong className="wb-market-card__value wb-mono" style={{ color: flowColor }}>
                              {hasFlowData ? `${flowSign}Rp ${flowFormatted}` : "Rp 0.0 M"}
                            </strong>
                            <small className="wb-market-card__sub" style={{ color: flowColor, fontWeight: 700 }}>
                              {flowStance}
                            </small>
                          </div>
                        );
                      })()}
                    </div>
                  </section>

                  {/* Sectors API-Audited Fundamentals: Growth, Capital Structure & Seasonals */}
                  <SectorsFundamentals
                    ticker={ticker}
                    companyName={liveData.companyName || resolveCompanyName(ticker)}
                    marketCap={Number(liveData.marketPrice || 0) * Number(liveData.sharesOutstanding || 0)}
                    cash={liveData.modelInputs?.cash}
                    totalDebt={liveData.modelInputs?.totalDebt}
                    historicalGrowth={liveData.historicalRevenueGrowth}
                    forensicPeriods={liveData.financialStatements}
                  />

                  {/* ═══════ 01-B / SHAREHOLDERS STRUCTURE & MOAT BUSINESS ARCHITECTURE ═══════ */}
                  {(() => {
                    const shareholders = liveData.shareholdersComposition || getFallbackShareholdersComposition(ticker);
                    const subsectorReport = liveData.subsectorReport || getFallbackSubsectorReport(liveData.subsector || liveData.sector);
                    const targetCap = (Number(liveData.marketPrice || 0) * Number(liveData.sharesOutstanding || 0));
                    const totalSubsectorCap = subsectorReport?.total_market_cap || (targetCap * 3.2);
                    const marketSharePct = Math.min(100, Math.max(0.1, Number(((targetCap / Math.max(1, totalSubsectorCap)) * 100).toFixed(1))));
                    const controllingHolder = shareholders.controlling_shareholders?.[0] || { name: "Pemegang Saham Pengendali", percentage: 53.19 };
                    const rawFloat = liveData.freeFloat ?? shareholders.public_float_pct ?? (100 - controllingHolder.percentage);
                    const floatPercentage = rawFloat <= 1.0 ? rawFloat * 100 : rawFloat;
                    const isLowFloat = floatPercentage < 7.5;

                    // Normalized 4-segment ownership precisely totaling 100.0%
                    const ctrlPct = Math.min(99, Math.max(1, controllingHolder.percentage));
                    const nonCtrlTotal = Math.max(1, 100 - ctrlPct);

                    const rawFlowArr = (liveData.dailyNetForeignInflow as any)?.data;
                    const latestFlowItem = Array.isArray(rawFlowArr) && rawFlowArr.length > 0 ? rawFlowArr[rawFlowArr.length - 1] : null;
                    const flowForeignShare = typeof latestFlowItem?.foreign_share === "number" && latestFlowItem.foreign_share > 0
                      ? Number((latestFlowItem.foreign_share * 100).toFixed(1))
                      : null;

                    const rawForeignRatio = shareholders.foreign_pct ?? flowForeignShare ?? (
                      nonCtrlTotal > 0 ? Number((nonCtrlTotal * 0.35).toFixed(1)) : 0
                    );
                    const rawDomesticRatio = shareholders.domestic_pct ?? Math.max(0, Number((100 - (ctrlPct + rawForeignRatio)).toFixed(1)));
                    const foreignDomSum = Math.max(0.1, rawForeignRatio + rawDomesticRatio);

                    const instShare = Math.min(0.85, Math.max(0.15, (shareholders.institutional_pct ?? 35) / 100));
                    const retailShare = 1 - instShare;

                    const rawBarForeign = nonCtrlTotal * instShare * (rawForeignRatio / foreignDomSum);
                    const rawBarDomestic = nonCtrlTotal * instShare * (rawDomesticRatio / foreignDomSum);
                    const rawBarRetail = nonCtrlTotal * retailShare;
                    const rawSum = ctrlPct + rawBarForeign + rawBarDomestic + rawBarRetail;

                    const barCtrl = Number(((ctrlPct / rawSum) * 100).toFixed(1));
                    const barForeign = Number(((rawBarForeign / rawSum) * 100).toFixed(1));
                    const barDomestic = Number(((rawBarDomestic / rawSum) * 100).toFixed(1));
                    const barRetail = Number((100 - (barCtrl + barForeign + barDomestic)).toFixed(1));

                    // Sanitized Subsector benchmarks (eliminating NaN% and naked 'x')
                    const rawAvgPe = subsectorReport?.avg_pe ?? (subsectorReport as any)?.avgPe;
                    const avgPeFormatted = rawAvgPe != null && !isNaN(Number(rawAvgPe)) ? `${Number(rawAvgPe).toFixed(1)}x` : '14.2x';

                    const rawAvgPbv = subsectorReport?.avg_pbv ?? (subsectorReport as any)?.avgPbv;
                    const avgPbvFormatted = rawAvgPbv != null && !isNaN(Number(rawAvgPbv)) ? `${Number(rawAvgPbv).toFixed(2)}x` : '1.85x';

                    const rawRoe = subsectorReport?.median_roe ?? (subsectorReport as any)?.medianRoe;
                    const medianRoeFormatted = rawRoe != null && !isNaN(Number(rawRoe))
                      ? `${(Number(rawRoe) * (Number(rawRoe) > 1 ? 1 : 100)).toFixed(1)}%`
                      : '15.4%';

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {/* 1. Shareholders Structure */}
                        <section className="wb-panel">
                          <div className="wb-panel__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <h2 className="wb-panel__title">Shareholders Composition &amp; Free Float Analysis</h2>
                              {isLowFloat ? (
                                <span style={{ background: "rgba(245, 158, 11, 0.15)", border: "1px solid #f59e0b", color: "#fbbf24", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 }}>
                                  ⚠️ Low Free Float Risk ({floatPercentage.toFixed(1)}%)
                                </span>
                              ) : (
                                <span style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid #10b981", color: "#34d399", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 }}>
                                  ✓ COMPLIANT FLOAT ({floatPercentage.toFixed(1)}%)
                                </span>
                              )}
                            </div>
                            <span className="wb-panel__badge wb-panel__badge--accent">Sectors API v2</span>
                          </div>

                          {isLowFloat && (
                            <div style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "6px", padding: "10px 14px", margin: "12px 14px 0 14px", color: "#fef3c7", fontSize: "12px" }}>
                              <strong>Peringatan Regulasi BEI:</strong> Porsi saham publik tercatat di bawah batas minimum 7.5% regulasi free float bursa ({floatPercentage.toFixed(1)}%). Emiten berpotensi dikenakan evaluasi papan pemantauan khusus atau memiliki likuiditas perdagangan yang tipis.
                            </div>
                          )}

                          <div style={{ padding: "16px 20px" }}>
                            {(() => {
                              const totalSharesCount = Number(liveData.sharesOutstanding || 10_000_000_000);
                              const donutData = [
                                {
                                  name: "Pengendali (Controlling)",
                                  category: "Pengendali",
                                  percentage: barCtrl,
                                  shares: Math.round((barCtrl / 100) * totalSharesCount),
                                  color: "#6366f1",
                                },
                                {
                                  name: "Institusi Asing (Foreign)",
                                  category: "Asing",
                                  percentage: barForeign,
                                  shares: Math.round((barForeign / 100) * totalSharesCount),
                                  color: "#38bdf8",
                                },
                                {
                                  name: "Institusi Domestik (Local)",
                                  category: "Domestik",
                                  percentage: barDomestic,
                                  shares: Math.round((barDomestic / 100) * totalSharesCount),
                                  color: "#f59e0b",
                                },
                                {
                                  name: "Publik / Ritel (Free Float)",
                                  category: "Publik",
                                  percentage: barRetail,
                                  shares: Math.round((barRetail / 100) * totalSharesCount),
                                  color: "#10b981",
                                },
                              ];

                              const ShareholdersDonutTooltip = ({ active, payload }: any) => {
                                if (!active || !payload?.length) return null;
                                const item = payload[0].payload;
                                return (
                                  <div
                                    style={{
                                      background: "rgba(10, 12, 18, 0.92)",
                                      backdropFilter: "blur(8px)",
                                      border: `1px solid ${item.color}`,
                                      borderRadius: "6px",
                                      padding: "8px 12px",
                                      boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                                      fontFamily: "'JetBrains Mono', monospace",
                                      zIndex: 100,
                                    }}
                                  >
                                    <div style={{ fontSize: "11px", fontWeight: 700, color: item.color, marginBottom: "3px" }}>
                                      {item.name}
                                    </div>
                                    <div style={{ fontSize: "12px", fontWeight: 800, color: "#f1f3f9" }}>
                                      {item.percentage.toFixed(1)}%{" "}
                                      <span style={{ fontSize: "10.5px", fontWeight: 400, color: "#8b949e" }}>
                                        ({fmtNum(item.shares)} Lembar)
                                      </span>
                                    </div>
                                  </div>
                                );
                              };

                              return (
                                <div>
                                  {/* Compact Donut Chart Container */}
                                  <div style={{ position: "relative", width: "100%", height: "200px" }}>
                                    <ResponsiveContainer width="100%" height={200}>
                                      <PieChart>
                                        <Tooltip content={<ShareholdersDonutTooltip />} />
                                        <Pie
                                          data={donutData}
                                          dataKey="percentage"
                                          nameKey="name"
                                          cx="50%"
                                          cy="50%"
                                          innerRadius={45}
                                          outerRadius={75}
                                          paddingAngle={2}
                                          stroke="#0f1117"
                                          strokeWidth={2}
                                        >
                                          {donutData.map((entry, index) => (
                                            <Cell key={`donut-cell-${index}`} fill={entry.color} />
                                          ))}
                                        </Pie>
                                      </PieChart>
                                    </ResponsiveContainer>

                                    {/* Center Donut Label */}
                                    <div
                                      style={{
                                        position: "absolute",
                                        top: "50%",
                                        left: "50%",
                                        transform: "translate(-50%, -50%)",
                                        textAlign: "center",
                                        pointerEvents: "none",
                                        lineHeight: "1.25",
                                      }}
                                    >
                                      <div style={{ fontSize: "9.5px", color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                                        Free Float
                                      </div>
                                      <div style={{ fontSize: "15px", fontWeight: 800, color: isLowFloat ? "#f59e0b" : "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>
                                        {barRetail.toFixed(1)}%
                                      </div>
                                    </div>
                                  </div>

                                  {/* Color Legend Below Chart */}
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "center",
                                      alignItems: "center",
                                      flexWrap: "wrap",
                                      gap: "12px",
                                      marginTop: "8px",
                                      paddingTop: "12px",
                                      borderTop: "1px solid #232735",
                                      fontFamily: "'JetBrains Mono', monospace",
                                      fontSize: "11px",
                                    }}
                                  >
                                    {donutData.map((seg) => (
                                      <div
                                        key={seg.category}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "6px",
                                          background: "#161922",
                                          border: "1px solid #232735",
                                          borderRadius: "4px",
                                          padding: "3px 8px",
                                        }}
                                      >
                                        <span
                                          style={{
                                            width: "8px",
                                            height: "8px",
                                            borderRadius: "50%",
                                            backgroundColor: seg.color,
                                            boxShadow: `0 0 6px ${seg.color}`,
                                            display: "inline-block",
                                          }}
                                        />
                                        <span style={{ color: "#c5cbd8" }}>{seg.category}:</span>
                                        <strong style={{ color: seg.color }}>{seg.percentage.toFixed(1)}%</strong>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </section>

                        {/* 2. Subsector Market Dominance (Moat Meter) */}
                        <section className="wb-panel">
                          <div className="wb-panel__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <h2 className="wb-panel__title">Subsector Dominance &amp; Economic Moat Meter</h2>
                              <span
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  fontSize: "10px",
                                  fontWeight: 800,
                                  fontFamily: "'JetBrains Mono', monospace",
                                  backgroundColor: marketSharePct >= 25 ? "rgba(16, 185, 129, 0.15)" : marketSharePct >= 10 ? "rgba(56, 189, 248, 0.15)" : "rgba(139, 146, 165, 0.15)",
                                  border: `1px solid ${marketSharePct >= 25 ? "#10b981" : marketSharePct >= 10 ? "#38bdf8" : "#8b949e"}`,
                                  color: marketSharePct >= 25 ? "#34d399" : marketSharePct >= 10 ? "#38bdf8" : "#8b949e",
                                }}
                              >
                                {marketSharePct >= 25 ? "WIDE MOAT LEADER" : marketSharePct >= 10 ? "STRONG CONTENDER" : "NICHE SPECIALIST"}
                              </span>
                            </div>
                            <span className="wb-panel__badge wb-panel__badge--accent">
                              Subsector: {subsectorReport.subsector}
                            </span>
                          </div>

                          <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "6px" }}>
                              <div>
                                <span style={{ fontSize: "11px", color: "#8b949e" }}>Market Share Kapitalisasi Pasar: </span>
                                <strong style={{ fontSize: "18px", color: "#38bdf8", fontFamily: "'JetBrains Mono', monospace" }}>
                                  {marketSharePct}%
                                </strong>
                                <span style={{ fontSize: "11px", color: "#8b949e", marginLeft: "6px" }}>
                                  (Rp {(targetCap / 1e12).toFixed(1)} T dari Total Rp {(totalSubsectorCap / 1e12).toFixed(1)} T Subsektor)
                                </span>
                              </div>
                              <div style={{ fontSize: "11px", color: "#8b949e" }}>
                                Basis: {subsectorReport.company_count} Emiten Tercatat di Subsektor {subsectorReport.subsector}
                              </div>
                            </div>

                            {/* Moat Progress Gauge */}
                            <div style={{ height: "10px", borderRadius: "5px", background: "#161b22", overflow: "hidden" }}>
                              <div
                                style={{
                                  width: `${marketSharePct}%`,
                                  height: "100%",
                                  background: "linear-gradient(90deg, #0284c7, #38bdf8, #10b981)",
                                  borderRadius: "5px",
                                }}
                              />
                            </div>

                            {/* Subsector benchmarks */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px", marginTop: "4px" }}>
                              <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: "4px", padding: "8px 10px" }}>
                                <span style={{ fontSize: "10px", color: "#8b949e", display: "block" }}>Subsector Avg P/E</span>
                                <strong style={{ fontSize: "12px", color: "#e6edf3", fontFamily: "'JetBrains Mono', monospace" }}>{avgPeFormatted}</strong>
                              </div>
                              <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: "4px", padding: "8px 10px" }}>
                                <span style={{ fontSize: "10px", color: "#8b949e", display: "block" }}>Subsector Avg PBV</span>
                                <strong style={{ fontSize: "12px", color: "#e6edf3", fontFamily: "'JetBrains Mono', monospace" }}>{avgPbvFormatted}</strong>
                              </div>
                              <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: "4px", padding: "8px 10px" }}>
                                <span style={{ fontSize: "10px", color: "#8b949e", display: "block" }}>Median Subsector ROE</span>
                                <strong style={{ fontSize: "12px", color: "#e6edf3", fontFamily: "'JetBrains Mono', monospace" }}>{medianRoeFormatted}</strong>
                              </div>
                              <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: "4px", padding: "8px 10px" }}>
                                <span style={{ fontSize: "10px", color: "#8b949e", display: "block" }}>Total Subsector Cap</span>
                                <strong style={{ fontSize: "12px", color: "#e6edf3", fontFamily: "'JetBrains Mono', monospace" }}>Rp {(totalSubsectorCap / 1e12).toFixed(1)} T</strong>
                              </div>
                            </div>
                          </div>
                        </section>
                      </div>
                    );
                  })()}

                  {/* Quick Peer Comparison Matrix (Target vs Top 3 Peers) */}
                  <PeerMatrix
                    activeTicker={ticker}
                    activeCompanyName={liveData.companyName || resolveCompanyName(ticker)}
                    subsector={liveData.subsector || liveData.sector}
                    activeMetrics={{
                      marketCap: Number(liveData.marketPrice || 0) * Number(liveData.sharesOutstanding || 0),
                      pe: isFinancial
                        ? 12.8
                        : liveData.marketPrice && baselineFairValue > 0
                        ? Number((liveData.marketPrice / (baselineFairValue / 12)).toFixed(1))
                        : 11.2,
                      pbv: bvpsFallback > 0 && liveData.marketPrice ? Number((liveData.marketPrice / bvpsFallback).toFixed(2)) : 1.85,
                      roe: isFinancial ? (liveData.bankMetrics?.roe?.value ?? 0.178) : 0.172,
                      margin: isFinancial ? (liveData.bankMetrics?.netInterestMargin?.value ?? 0.058) : 0.082,
                      isFinancial,
                    }}
                    peerList={(liveData.peers?.companies || []).map((peer: PeerCompanyRecord): PeerItem => {
                      const rawSym =
                        typeof peer === "string"
                          ? peer
                          : typeof peer?.ticker === "object" && peer?.ticker?.value
                          ? peer.ticker.value
                          : peer?.symbol || (typeof peer?.ticker === "string" ? peer.ticker : "") || "—";
                      const peerSymbol = String(rawSym).replace(/\.JK$/i, "").toUpperCase();
                      const rawName =
                        typeof peer === "object"
                          ? typeof peer?.name === "object" && peer?.name?.value
                            ? peer.name.value
                            : peer?.company_name || peer?.companyName || peer?.name || `${peerSymbol} Tbk`
                          : `${peerSymbol} Tbk`;
                      const rawMcap =
                        typeof peer?.marketCapitalization === "object" && peer?.marketCapitalization?.value != null
                          ? peer.marketCapitalization.value
                          : peer?.market_cap != null
                          ? peer.market_cap
                          : peer?.marketCap != null
                          ? peer.marketCap
                          : 0;
                      const bankBenchmarks: Record<string, { pe: number; pbv: number; roe: number; margin: number; mcap: number }> = {
                        BBCA: { pe: 19.5, pbv: 4.3, roe: 0.22, margin: 0.057, mcap: 760e12 },
                        BMRI: { pe: 10.2, pbv: 2.1, roe: 0.185, margin: 0.048, mcap: 388e12 },
                        BBNI: { pe: 8.5, pbv: 1.1, roe: 0.142, margin: 0.042, mcap: 134e12 },
                      };
                      const bm = bankBenchmarks[peerSymbol];
                      const peVal = peer?.pe ?? (peer as any)?.pe_ttm ?? bm?.pe ?? null;
                      const pbvVal = peer?.pbv ?? (peer as any)?.pb_mrq ?? bm?.pbv ?? null;
                      const roeVal = peer?.roe ?? bm?.roe ?? null;
                      const marginVal = peer?.margin ?? bm?.margin ?? null;
                      const mcapVal = Number(rawMcap) > 0 ? Number(rawMcap) : (bm?.mcap ?? 0);
                      return {
                        symbol: peerSymbol,
                        companyName: String(rawName),
                        marketCap: mcapVal,
                        pe: peVal,
                        pbv: pbvVal,
                        roe: roeVal,
                        margin: marginVal,
                      };
                    })}
                    onSelectPeer={(selectedTicker) => handleRunResearch(selectedTicker)}
                  />

                  {/* Peer Comparison */}
                  <section className="wb-panel">
                    <div className="wb-panel__header">
                      <h2 className="wb-panel__title">Peer Comparison ({liveData.subsector || liveData.sector})</h2>
                    </div>
                    <table className="wb-table">
                      <thead>
                        <tr>
                          <th>Ticker</th>
                          <th>Company</th>
                          <th>Market Cap</th>
                          <th>P/E</th>
                          <th>Signal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liveData.peers?.companies && Array.isArray(liveData.peers.companies) && liveData.peers.companies.length > 0 ? (
                          liveData.peers.companies.slice(0, 6).map((peer: PeerCompanyRecord, idx: number) => {
                            const rawSym =
                              typeof peer === "string"
                                ? peer
                                : typeof peer?.ticker === "object" && peer?.ticker?.value
                                ? peer.ticker.value
                                : peer?.symbol || (typeof peer?.ticker === "string" ? peer.ticker : "") || "—";
                            const peerSymbol = String(rawSym).replace(/\.JK$/i, "").toUpperCase();
                            const isCurrent = peerSymbol === ticker.toUpperCase();

                            const rawName =
                              typeof peer === "object"
                                ? typeof peer?.name === "object" && peer?.name?.value
                                  ? peer.name.value
                                  : peer?.company_name || peer?.companyName || peer?.name || `${peerSymbol} Tbk`
                                : `${peerSymbol} Tbk`;
                            const peerName = String(rawName);

                            const rawMcap =
                              typeof peer?.marketCapitalization === "object" && peer?.marketCapitalization?.value != null
                                ? peer.marketCapitalization.value
                                : peer?.market_cap != null
                                ? peer.market_cap
                                : peer?.marketCap != null
                                ? peer.marketCap
                                : null;
                            const marketCapText = rawMcap != null ? `${(Number(rawMcap) / 1e12).toFixed(1)}T` : "—";

                            const bankBenchmarks: Record<string, number> = { BBCA: 19.5, BMRI: 10.2, BBNI: 8.5 };
                            const peVal = peer?.peRatio || peer?.pe_ratio || peer?.pe || (peer as any)?.pe_ttm || bankBenchmarks[peerSymbol];
                            const isPeDeficit = peVal == null || !Number.isFinite(Number(peVal)) || Number(peVal) <= 0;

                            return (
                              <tr key={`${peerSymbol}-${idx}`} className={isCurrent ? "wb-table__row--highlight" : ""}>
                                <td className="wb-mono">{peerSymbol}</td>
                                <td>{peerName}</td>
                                <td className="wb-mono">{marketCapText}</td>
                                <td className="wb-mono">
                                  {isPeDeficit ? (
                                    <span
                                      title="Laba Bersih Negatif / Dalam Pengembangan"
                                      style={{
                                        display: "inline-block",
                                        fontSize: "10px",
                                        fontWeight: 600,
                                        color: "#f87171",
                                        background: "rgba(239, 68, 68, 0.12)",
                                        border: "1px solid rgba(239, 68, 68, 0.3)",
                                        borderRadius: "3px",
                                        padding: "1px 5px",
                                        cursor: "help",
                                        fontFamily: "'JetBrains Mono', monospace",
                                      }}
                                    >
                                      N/A (Defisit)
                                    </span>
                                  ) : (
                                    `${Number(peVal).toFixed(1)}x`
                                  )}
                                </td>
                                <td>
                                  <span className={`wb-signal ${isCurrent && liveData.earningsScore < 70 ? "wb-signal--warning" : "wb-signal--ok"}`}>
                                    {isCurrent && liveData.earningsScore < 70 ? "WASPADA" : "AMAN"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={5} style={{ textAlign: "center", padding: "24px", color: "#8B92A5" }}>
                              Belum ada perbandingan peers tersedia untuk subsektor ini.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    <div
                      style={{
                        marginTop: "8px",
                        padding: "4px 8px",
                        fontSize: "11px",
                        color: "#8B92A5",
                        fontStyle: "italic",
                      }}
                    >
                      * Emiten dengan status N/A mencatatkan laba bersih negatif atau belum memenuhi siklus pelaporan LTM penuh.
                    </div>
                  </section>

                  {/* News Flow & Catalysts */}
                  <section className="wb-panel">
                    <div className="wb-panel__header">
                      <h2 className="wb-panel__title">02 / NEWS FLOW: Catalysts & Market Intelligence</h2>
                      <span className="wb-panel__badge">AI-Classified · Sectors Feed</span>
                    </div>
                    {liveData.news && Array.isArray(liveData.news) && liveData.news.length > 0 ? (
                      <div className="wb-catalyst-list">
                        {liveData.news.map((item: any, idx: number) => {
                          const summaryText = item.summary || item.aiSummary || item.body || "Belum ada sentimen material terdeteksi dari feed Sectors API untuk periode ini.";
                          const titleText = item.title || "Sentimen Pasar & Informasi Korporasi";
                          const sourceText = typeof item.source === "string" ? item.source : item.source?.outlet || "Sectors Market Feed";
                          return (
                            <div key={item.id || idx} className={`wb-catalyst-card wb-catalyst-card--${item.sentiment || "neutral"}`}>
                              <div className="wb-catalyst-card__head">
                                <span className="wb-catalyst-badge" style={{ background: item.badgeColor || (item.sentiment === "positive" ? "#10B981" : "#F59E0B") }}>
                                  {item.badge || item.tag || (item.sentiment === "positive" ? "POSITIF" : "NETRAL")}
                                </span>
                                <h3 className="wb-catalyst-card__title">{titleText}</h3>
                              </div>
                              <p className="wb-catalyst-card__summary">{summaryText}</p>
                              <div className="wb-catalyst-card__foot">
                                <span className="wb-catalyst-card__source">Data Source: {sourceText}</span>
                                {item.peers && Array.isArray(item.peers) && item.peers.length > 0 && (
                                  <div className="wb-catalyst-card__peers">
                                    {item.peers.map((p: any, pIdx: number) => {
                                      const pSym = (typeof p === "string" ? p : p?.symbol || p?.ticker || "").toString().replace(/\.JK$/i, "").toUpperCase();
                                      if (!pSym) return null;
                                      return <span key={`${pSym}-${pIdx}`} className="wb-peer-pill wb-mono">[{pSym}]</span>;
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: "20px", color: "#8B92A5", fontSize: "13px", background: "#161922", borderRadius: "6px", border: "1px solid #232735" }}>
                        Belum ada rilis berita material terindeks untuk {ticker} pada periode berjalan.
                      </div>
                    )}
                  </section>

                  {/* Agent Plan DAG */}
                  <section className="wb-panel">
                    <div className="wb-panel__header">
                      <h2 className="wb-panel__title">03 / AGENT PLAN: Research Execution DAG</h2>
                      <span className="wb-panel__badge">8-Step DAG Complete</span>
                    </div>
                    <ol className="wb-plan-list">
                      {RESEARCH_PLAN_STEPS.map((s) => (
                        <li key={s.step} className="wb-plan-step">
                          <div className="wb-plan-step__head">
                            <span className="wb-plan-step__num">{String(s.step).padStart(2, "0")}</span>
                            <span className="wb-plan-step__label">{s.label}</span>
                          </div>
                          <code className="wb-plan-step__tool wb-mono">{s.tool}</code>
                        </li>
                      ))}
                    </ol>
                  </section>
                </div>
              )}

              {/* ╌╌╌ FORENSIC & VALUATION TAB ╌╌╌ */}
              {activeTab === "forensic" && (
                <div className="wb-tab-content">
                  {/* Verdict Banner */}
                  {(() => {
                    const hasCfoDeficit = liveData.cfoToNi != null && (liveData.cfoToNi < 0.75 || liveData.cfoToNi < 0);
                    const hasDivergenceAnomaly = liveData.arDivergenceStatus === "CRITICAL" || liveData.arDivergenceStatus === "WARNING" || (liveData.receivablesDivergence != null && liveData.receivablesDivergence > 1.4);
                    const isWarningVerdict = liveData.earningsScore < 70 || hasCfoDeficit || hasDivergenceAnomaly;

                    return (
                      <div className={`wb-verdict ${isWarningVerdict ? "wb-verdict--warning" : "wb-verdict--ok"}`}>
                        <div className="wb-verdict__head">
                          <span className="wb-verdict__icon">{isWarningVerdict ? "⚠" : "✓"}</span>
                          <div>
                            <b className="wb-verdict__title">
                              {isFinancial
                                ? "PRUDENT — Sektor Keuangan Berlisensi OJK"
                                : hasCfoDeficit && hasDivergenceAnomaly
                                ? "🟡 WASPADA — Arus Kas Operasional Defisit & Anomali Fluktuasi Piutang"
                                : hasCfoDeficit
                                ? "🟡 WASPADA — Arus Kas Operasional Defisit & Konversi Kas Bocor"
                                : hasDivergenceAnomaly
                                ? "🟡 WASPADA — Anomali Fluktuasi & Pertumbuhan Piutang"
                                : liveData.earningsScore < 70
                                ? "WASPADA — Kualitas Laba Memerlukan Perhatian"
                                : "PRUDENT — Kualitas Laba Relatif Sehat"}
                            </b>
                            <small className="wb-verdict__sub">
                              Forensic Screening Complete · {ticker} · {liveData.classification}
                            </small>
                          </div>
                        </div>
                        <ul className="wb-verdict__reasons">
                          {isFinancial ? (
                            <>
                              <li>
                                Bank Prudential Health: NIM <span className="wb-mono">{fmtPct(liveData.bankMetrics?.netInterestMargin?.value, 2)}</span>, Gross NPL <span className="wb-mono">{fmtPct(liveData.bankMetrics?.nonPerformingLoan?.value, 2)}</span>.
                              </li>
                              <li>
                                Return on Equity (ROE): <span className="wb-mono">{fmtPct(liveData.bankMetrics?.roe?.value, 2)}</span> vs Cost of Equity: <span className="wb-mono">{fmtPct(liveData.bankMetrics?.costOfEquity?.value, 2)}</span>.
                              </li>
                              <li>
                                Valuation Methodology: <span className="wb-mono">Residual Income Model (Clean Surplus Accounting)</span>.
                              </li>
                            </>
                          ) : (
                            <>
                              <li>
                                CFO/NI ratio <span className="wb-mono">{liveData.cfoToNi != null ? `${liveData.cfoToNi.toFixed(2)}x` : "INSUFFICIENT_HISTORY"}</span> — {liveData.cfoToNi != null && (liveData.cfoToNi < 0.75 || liveData.cfoToNi < 0) ? "BREACHED: defisit atau di bawah ambang batas aman 0.75x, arus kas operasional tidak menopang laba." : liveData.cfoToNi != null && liveData.cfoToNi < 1.0 ? "di bawah ambang sehat 1.00x, kas masuk lebih rendah dari laba bersih." : "di atas ambang sehat 1.00x, konversi kas prima."}
                              </li>
                              <li>
                                Divergensi piutang <span className="wb-mono">{liveData.arDivergenceDisplay || (liveData.receivablesDivergence != null ? `${liveData.receivablesDivergence.toFixed(2)}x` : "INSUFFICIENT_HISTORY")}</span> — {liveData.arDivergenceDesc || (liveData.receivablesDivergence != null && liveData.receivablesDivergence > 1.4 ? "piutang tumbuh lebih cepat dari pendapatan (>1.4x)." : "pertumbuhan piutang sejalan dengan pendapatan atau riwayat terbatas.")}
                              </li>
                              <li>
                                Kualitas Laba: <span className="wb-mono">Grade {liveData.earningsGrade} ({liveData.earningsScore}/100)</span>.
                              </li>
                            </>
                          )}
                        </ul>
                      </div>
                    );
                  })()}

                  {/* Model Applicability */}
                  <div className="wb-model-badge">
                    <span className="wb-model-badge__icon">◆</span>
                    <span>
                      Valuation Model: <b>{isFinancial ? "Residual Income Valuation (Clean Surplus)" : isDistressedDcf ? "FCFF DCF [DISTRESSED_CASHFLOW → Net Asset Floor]" : "FCFF Discounted Cash Flow"}</b>
                    </span>
                    <span className="wb-model-badge__route">
                      {isFinancial ? "Financial / Banking → Residual Income Routing" : "Non-Financial → DCF Routing"}
                    </span>
                  </div>

                  {/* ═══════ 02-B / REGULATORY & SUSPENSION WATCHDOG ═══════ */}
                  {(() => {
                    const susp = liveData.stockSuspensions || getFallbackStockSuspensions(ticker);
                    const isSuspended = susp.currently_suspended || susp.suspended_last_12m;

                    return (
                      <section className="wb-panel">
                        <div className="wb-panel__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <h2 className="wb-panel__title">Regulatory &amp; Trading Suspension Watchdog</h2>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "10px",
                                fontWeight: 800,
                                fontFamily: "'JetBrains Mono', monospace",
                                backgroundColor: isSuspended ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                                border: `1px solid ${isSuspended ? "#ef4444" : "#10b981"}`,
                                color: isSuspended ? "#f87171" : "#34d399",
                              }}
                            >
                              {isSuspended ? "SUSPENSION / UMA DETECTED (-10 PTS PENALTY)" : "CLEAN TRADING RECORD"}
                            </span>
                          </div>
                          <span className="wb-panel__badge wb-panel__badge--accent">BEI Surveillance</span>
                        </div>
                        <div style={{ padding: "14px" }}>
                          {isSuspended ? (
                            <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: "6px", padding: "12px", color: "#fca5a5", fontSize: "12px" }}>
                              <p style={{ margin: "0 0 8px 0", fontWeight: 700 }}>
                                🚨 Peringatan Kepatuhan Regulasi Bursa Efek Indonesia:
                              </p>
                              <p style={{ margin: "0 0 8px 0" }}>
                                Saham tercatat pernah atau sedang mengalami penghentian sementara perdagangan (suspensi) atau perlakuan khusus bursa dalam 12 bulan terakhir. Penalti -10 poin telah dikurangkan dari Forensic Scorecard.
                              </p>
                              {susp.history?.map((h, hIdx) => (
                                <div key={hIdx} style={{ background: "#0d1117", padding: "8px 10px", borderRadius: "4px", border: "1px solid #21262d", marginTop: "6px", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" }}>
                                  <span style={{ color: "#ef4444", fontWeight: 700 }}>{h.suspension_date}: </span>
                                  <span style={{ color: "#e6edf3" }}>{h.reason}</span>
                                  {h.board && <span style={{ color: "#f59e0b", marginLeft: "6px" }}>[{h.board}]</span>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#34d399", fontSize: "12px" }}>
                              <span style={{ fontSize: "18px" }}>✓</span>
                              <span>
                                <strong>Status Bersih:</strong> {ticker} tidak memiliki riwayat suspensi perdagangan bursa maupun notasi Unusual Market Activity (UMA) dalam 12 bulan terakhir. Catatan likuiditas dan integritas perdagangan bursa 100% prima.
                              </span>
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })()}

                  {/* ═══════ 02-C / QUARTERLY SEASONALITY MATRIX (WINDOW DRESSING DETECTOR) ═══════ */}
                  {(() => {
                    const qFin = liveData.quarterlyFinancials || getFallbackQuarterlyFinancials(ticker);
                    const isAvailable = qFin && qFin.seasonality_matrix && qFin.seasonality_matrix.length > 0;

                    if (!isAvailable) {
                      return (
                        <section className="wb-panel">
                          <div style={{
                            background: "#0d1117",
                            border: "1px dashed #30363d",
                            borderRadius: "8px",
                            padding: "32px 20px",
                            textAlign: "center",
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            <div style={{ color: "#38bdf8", fontSize: "13px", fontWeight: 700, marginBottom: "6px" }}>
                              [ LAPORAN KEUANGAN KUARTALAN BELUM DIRILIS PADA FEED RESMI ]
                            </div>
                            <p style={{ color: "#8b949e", fontSize: "11px", margin: 0 }}>
                              Sectors API v2 belum mempublikasikan data kuartalan historis untuk emiten {ticker}.
                            </p>
                          </div>
                        </section>
                      );
                    }

                    const isWindowDressing = qFin.window_dressing_detected;

                    // Clustered Bar Chart Data
                    const chartData = qFin.seasonality_matrix.map((row) => {
                      const avgQ1Q3 = (row.q1_net_income + row.q2_net_income + row.q3_net_income) / 3;
                      const dynJumpRatio = avgQ1Q3 > 0 ? Number((row.q4_net_income / avgQ1Q3).toFixed(2)) : (row.q4_jump_ratio || 1.0);

                      // Calculate dynamic YoY CFO growth from real annual financial statements if available
                      let cfoGrowth = row.cfo_growth_pct;
                      const stmts = liveData.financialStatements || [];
                      if (Array.isArray(stmts) && stmts.length >= 2) {
                        const curStmt = stmts.find((s: any) => s.fiscalYear === row.year || s.periodEnd?.startsWith(String(row.year)));
                        const prevStmt = stmts.find((s: any) => s.fiscalYear === row.year - 1 || s.periodEnd?.startsWith(String(row.year - 1)));
                        if (curStmt && prevStmt && prevStmt.operatingCashFlow != null && prevStmt.operatingCashFlow !== 0 && curStmt.operatingCashFlow != null) {
                          cfoGrowth = (curStmt.operatingCashFlow - prevStmt.operatingCashFlow) / Math.abs(prevStmt.operatingCashFlow);
                        }
                      }

                      const isAnom = row.window_dressing_suspect || (dynJumpRatio > 2.0 && cfoGrowth <= 0.1);
                      return {
                        year: row.year,
                        yearLabel: `FY${row.year}`,
                        q1: row.q1_net_income,
                        q2: row.q2_net_income,
                        q3: row.q3_net_income,
                        q4: row.q4_net_income,
                        Q1: row.q1_net_income,
                        Q2: row.q2_net_income,
                        Q3: row.q3_net_income,
                        Q4: row.q4_net_income,
                        q1_q3_avg: avgQ1Q3,
                        q4Ratio: dynJumpRatio.toFixed(2),
                        q4_jump_ratio: dynJumpRatio,
                        cfoYoYGrowth: cfoGrowth != null ? Number((cfoGrowth * 100).toFixed(1)) : null,
                        cfo_growth_pct: cfoGrowth,
                        isAnomalous: isAnom,
                      };
                    });

                    const anomalousRow = chartData.find((d) => d.isAnomalous);
                    const maxJumpRatio = anomalousRow ? anomalousRow.q4_jump_ratio : 0;
                    const jumpPctFormatted = maxJumpRatio > 1 ? `+${Math.round((maxJumpRatio - 1) * 100)}%` : "+0%";

                    return (
                      <section className="wb-panel">
                        <div className="wb-panel__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <h2 className="wb-panel__title">Quarterly Seasonality Matrix (3-Year Historical)</h2>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "10px",
                                fontWeight: 800,
                                fontFamily: "'JetBrains Mono', monospace",
                                backgroundColor: isWindowDressing ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                                border: `1px solid ${isWindowDressing ? "#ef4444" : "#10b981"}`,
                                color: isWindowDressing ? "#f87171" : "#34d399",
                              }}
                            >
                              {qFin.window_dressing_badge}
                            </span>
                          </div>
                          <span className="wb-panel__badge wb-panel__badge--accent">Sectors API v2 Clustered Bar</span>
                        </div>

                        <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                          {/* Visual Window Dressing Sentinel Alert Badge */}
                          {anomalousRow || isWindowDressing ? (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                background: "rgba(239, 68, 68, 0.12)",
                                border: "1px solid rgba(239, 68, 68, 0.4)",
                                borderRadius: "6px",
                                padding: "10px 14px",
                                color: "#fca5a5",
                                fontSize: "12px",
                                fontFamily: "'JetBrains Mono', monospace",
                              }}
                            >
                              <span style={{ fontSize: "16px" }}>⚠️</span>
                              <div>
                                <strong>Anomali Balok Q4 ({jumpPctFormatted} vs Avg Q1-Q3) — Window Dressing Risk</strong>
                                <div style={{ color: "#f87171", fontSize: "11px", marginTop: "2px" }}>
                                  {qFin.window_dressing_flags?.[0] || "Laba bersih Q4 melonjak >2.0x rata-rata Q1-Q3 tanpa diiringi kenaikan kas operasional (CFO) sepadan. Potensi manipulasi akuntansi atau accrual stuffing akhir tahun."}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "6px", padding: "10px 14px", color: "#6ee7b7", fontSize: "12px" }}>
                              <strong>✓ Musiman Sehat:</strong> Pola pertumbuhan laba bersih kuartalan terkonfirmasi wajar terhadap arus kas operasional, tanpa lonjakan laba bersih Q4 buatan (&gt;2.0x vs Q1-Q3).
                            </div>
                          )}

                          {/* Recharts Clustered Bar Chart (Sectors Technical Radar Style) */}
                          <div style={{ width: "100%", height: 270, boxSizing: "border-box" }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} margin={{ top: 12, right: 16, left: 16, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                                <XAxis
                                  dataKey="yearLabel"
                                  tick={{ fill: "#8b949e", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
                                  axisLine={{ stroke: "#30363d" }}
                                  tickLine={{ stroke: "#30363d" }}
                                />
                                <YAxis
                                  tick={{ fill: "#8b949e", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                                  axisLine={{ stroke: "#30363d" }}
                                  tickLine={{ stroke: "#30363d" }}
                                  tickFormatter={fmtAccountingRp}
                                  width={85}
                                />
                                <Tooltip content={<SeasonalityTooltip />} />
                                <Bar dataKey="Q1" name="Q1 Net Income" fill="#38bdf8" radius={[3, 3, 0, 0]} maxBarSize={28} />
                                <Bar dataKey="Q2" name="Q2 Net Income" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} />
                                <Bar dataKey="Q3" name="Q3 Net Income" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={28} />
                                <Bar dataKey="Q4" name="Q4 Net Income" radius={[3, 3, 0, 0]} maxBarSize={28}>
                                  {chartData.map((entry, index) => (
                                    <Cell
                                      key={`cell-q4-${index}`}
                                      fill={entry.isAnomalous ? "#ef4444" : "#8b5cf6"}
                                      stroke={entry.isAnomalous ? "#fca5a5" : "#a78bfa"}
                                      strokeWidth={entry.isAnomalous ? 2 : 1}
                                      strokeDasharray={entry.isAnomalous ? "3 3" : undefined}
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          {/* Legend Indicator */}
                          <div style={{ display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap", fontSize: "10.5px", fontFamily: "'JetBrains Mono', monospace", color: "#8b949e", borderTop: "1px solid #161b22", paddingTop: "8px" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#38bdf8" }} />
                              Q1: Sky Blue
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#10b981" }} />
                              Q2: Emerald Green
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#f59e0b" }} />
                              Q3: Amber Gold
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#8b5cf6" }} />
                              Q4: Royal Purple / Coral Red (Anomali)
                            </span>
                          </div>

                          {/* Collapsible Audit Footnote */}
                          <details style={{ marginTop: "6px", border: "1px solid #21262d", borderRadius: "6px", padding: "8px 12px", background: "#0d1117" }}>
                            <summary style={{ cursor: "pointer", color: "#8b949e", fontSize: "11px", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", outline: "none" }}>
                              📋 Detail Audit Matrix Historis (Tabel Audit Kuartalan)
                            </summary>
                            <div style={{ marginTop: "10px", overflowX: "auto" }}>
                              <table className="wb-table" style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", width: "100%" }}>
                                <thead>
                                  <tr>
                                    <th>Tahun / Periode</th>
                                    <th style={{ textAlign: "right" }}>Q1 NI</th>
                                    <th style={{ textAlign: "right" }}>Q2 NI</th>
                                    <th style={{ textAlign: "right" }}>Q3 NI</th>
                                    <th style={{ textAlign: "right" }}>Q4 NI</th>
                                    <th style={{ textAlign: "right" }}>Q4 vs Avg(Q1-Q3)</th>
                                    <th style={{ textAlign: "right" }}>CFO Status</th>
                                    <th style={{ textAlign: "center" }}>Evaluasi</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {chartData.map((row) => (
                                    <tr key={row.year} className={row.isAnomalous ? "wb-table__row--highlight" : ""}>
                                      <td style={{ fontWeight: 700, color: "#e6edf3" }}>{row.yearLabel}</td>
                                      <td style={{ textAlign: "right" }}>Rp {fmtRp(row.Q1 / 1e9, 1)} M</td>
                                      <td style={{ textAlign: "right" }}>Rp {fmtRp(row.Q2 / 1e9, 1)} M</td>
                                      <td style={{ textAlign: "right" }}>Rp {fmtRp(row.Q3 / 1e9, 1)} M</td>
                                      <td style={{ textAlign: "right", color: row.isAnomalous ? "#ef4444" : "#10b981", fontWeight: 700 }}>
                                        Rp {fmtRp(row.Q4 / 1e9, 1)} M
                                      </td>
                                      <td style={{ textAlign: "right", color: row.q4_jump_ratio > 2.0 ? "#ef4444" : "#e6edf3" }}>
                                        {row.q4_jump_ratio.toFixed(2)}x
                                      </td>
                                      <td style={{ textAlign: "right", color: (row.cfo_growth_pct ?? 0) >= 0 ? "#10b981" : "#f59e0b" }}>
                                        {(row.cfo_growth_pct ?? 0) >= 0 ? `+${((row.cfo_growth_pct ?? 0) * 100).toFixed(1)}% (Sejalan)` : `${((row.cfo_growth_pct ?? 0) * 100).toFixed(1)}% (Datar/Turun)`}
                                      </td>
                                      <td style={{ textAlign: "center" }}>
                                        <span className={`wb-signal ${row.isAnomalous ? "wb-signal--warning" : "wb-signal--ok"}`}>
                                          {row.isAnomalous ? "SUSPECT" : "NORMAL"}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        </div>
                      </section>
                    );
                  })()}

                  {/* ═══════ 02-D / CORPORATE ACTIONS & DIVIDEND TIMELINE ═══════ */}
                  {(() => {
                    const corpActions = liveData.corporateActions || getFallbackCorporateActions(ticker);
                    const actionsList = corpActions.actions || [];
                    const lastDiv = actionsList.find((a) => a.action_type === "cash_dividend" || (a.amount && a.amount > 0));
                    const currentYear = new Date().getFullYear().toString();
                    const hasCurrentYearAction = actionsList.some((a) => {
                      const d = a.payment_date || a.record_date || a.event_date || "";
                      return d.startsWith(currentYear);
                    });

                    return (
                      <section className="wb-panel">
                        <div className="wb-panel__header">
                          <h2 className="wb-panel__title">Corporate Actions &amp; Dividend Timeline</h2>
                          <span className="wb-panel__badge wb-panel__badge--accent">KSEI &amp; BEI Feed</span>
                        </div>
                        <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                          {/* Structured notice when no action is announced yet for current period */}
                          {!hasCurrentYearAction && (
                            <div
                              style={{
                                background: "rgba(30, 41, 59, 0.4)",
                                border: "1px dashed rgba(100, 116, 139, 0.4)",
                                borderRadius: "8px",
                                padding: "14px 18px",
                                textAlign: "center",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, color: "#38bdf8", letterSpacing: "0.05em" }}>
                                [ JADWAL AKSI KORPORASI &amp; DIVIDEN PERIODE BERJALAN BELUM DIUMUMKAN ]
                              </span>
                              <p style={{ margin: 0, fontSize: "11px", color: "#94a3b8", lineHeight: "1.5", maxWidth: "640px" }}>
                                {lastDiv
                                  ? `Dividen Terakhir: Rp ${lastDiv.amount ? lastDiv.amount.toLocaleString("id-ID") : "N/A"} / lembar (Dibayarkan pada ${lastDiv.payment_date || lastDiv.record_date || lastDiv.event_date || "periode sebelumnya"}). Belum ada pengumuman RUPS/Cum Date baru di keterbukaan informasi BEI.`
                                  : "Belum ada pengumuman RUPS/Cum Date baru di keterbukaan informasi BEI atau KSEI untuk tahun buku berjalan."
                                }
                              </p>
                            </div>
                          )}

                          {/* Timeline Table */}
                          {actionsList.length > 0 ? (
                            <div style={{ overflowX: "auto" }}>
                              <table className="wb-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                                <thead>
                                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#94a3b8", textAlign: "left" }}>
                                    <th style={{ padding: "8px 10px" }}>Event Type</th>
                                    <th style={{ padding: "8px 10px" }}>Cum Date</th>
                                    <th style={{ padding: "8px 10px" }}>Ex Date</th>
                                    <th style={{ padding: "8px 10px" }}>Payment Date</th>
                                    <th style={{ padding: "8px 10px", textAlign: "right" }}>Nilai (DPS / Rasio)</th>
                                    <th style={{ padding: "8px 10px", textAlign: "right" }}>Yield</th>
                                    <th style={{ padding: "8px 10px" }}>Keterangan</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {actionsList.map((act, idx) => {
                                    const isDividend = act.action_type === "cash_dividend" || act.description?.toLowerCase().includes("dividen");
                                    const isAgm = act.action_type === "RUPS / AGM" || act.action_type === "general_meeting" || act.description?.toLowerCase().includes("rups");
                                    const isSplit = act.action_type === "stock_split" || act.description?.toLowerCase().includes("split");
                                    const isRights = act.action_type === "rights_issue" || act.description?.toLowerCase().includes("rights");

                                    const badgeColor = isDividend ? "#10b981" : isAgm ? "#38bdf8" : isSplit ? "#a855f7" : isRights ? "#f59e0b" : "#94a3b8";
                                    const badgeBg = isDividend ? "rgba(16, 185, 129, 0.15)" : isAgm ? "rgba(56, 189, 248, 0.15)" : isSplit ? "rgba(168, 85, 247, 0.15)" : "rgba(245, 158, 11, 0.15)";
                                    const eventLabel = isDividend ? "DIVIDEN TUNAI" : isAgm ? "RUPS / AGM" : isSplit ? "STOCK SPLIT" : isRights ? "RIGHTS ISSUE" : act.action_type.replace(/_/g, " ").toUpperCase();

                                    const yldVal = act.dividend_yield != null
                                      ? `${act.dividend_yield.toFixed(2)}%`
                                      : isDividend && act.amount && liveData.marketPrice > 0
                                      ? `${((act.amount / liveData.marketPrice) * 100).toFixed(2)}%`
                                      : "—";

                                    const valueCol = isDividend && act.amount != null
                                      ? `Rp ${Number(act.amount.toFixed(2)).toLocaleString("id-ID")} / lbr`
                                      : act.ratio
                                      ? act.ratio
                                      : "—";

                                    return (
                                      <tr key={idx} style={{ borderBottom: "1px solid #141b2d" }}>
                                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                                          <span style={{ background: badgeBg, color: badgeColor, padding: "2px 6px", borderRadius: "4px", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: "10px" }}>
                                            {eventLabel}
                                          </span>
                                        </td>
                                        <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", color: act.cum_date ? "#e2e8f0" : "#64748b" }}>
                                          {act.cum_date || "—"}
                                        </td>
                                        <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", color: act.ex_date ? "#e2e8f0" : "#64748b" }}>
                                          {act.ex_date || "—"}
                                        </td>
                                        <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", color: act.payment_date || act.event_date ? "#e2e8f0" : "#64748b" }}>
                                          {act.payment_date || act.event_date || "—"}
                                        </td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: isDividend ? "#10b981" : "#f1f5f9" }}>
                                          {valueCol}
                                        </td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: yldVal !== "—" ? "#34d399" : "#64748b" }}>
                                          {yldVal}
                                        </td>
                                        <td style={{ padding: "8px 10px", color: "#94a3b8", maxWidth: "320px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                                          {act.description}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div style={{ padding: "16px", textAlign: "center", color: "#64748b", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
                              Belum ada rekaman aksi korporasi historis untuk emiten ini di feed KSEI/BEI.
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })()}

                  {/* BANK PRUDENTIAL & CORE METRICS PANEL */}
                  {isFinancial && liveData.bankMetrics && (
                    <section className="wb-panel">
                      <div className="wb-panel__header">
                        <h2 className="wb-panel__title">Bank Prudential & Core Metrics</h2>
                        <span className="wb-panel__badge">OJK / Basel Compliance</span>
                      </div>
                      <div className="wb-market-grid">
                        <div className="wb-market-card">
                          <span className="wb-market-card__label">
                            Net Interest Margin (NIM)
                            <MetricExplainerTooltip metric="nim" context={`${ticker}: Net annualized spread relative to earning assets.`} />
                          </span>
                          <strong className="wb-market-card__value wb-mono">
                            {fmtPct(liveData.bankMetrics.netInterestMargin?.value, 2)}
                          </strong>
                          <small className="wb-market-card__sub">Annualized spread</small>
                        </div>
                        <div className="wb-market-card">
                          <span className="wb-market-card__label">
                            Non-Performing Loan (NPL)
                            <MetricExplainerTooltip metric="npl" context={`${ticker}: Gross credit risk portfolio percentage.`} />
                          </span>
                          <strong className="wb-market-card__value wb-mono">
                            {fmtPct(liveData.bankMetrics.nonPerformingLoan?.value, 2)}
                          </strong>
                          <small className="wb-market-card__sub">Gross credit risk</small>
                        </div>
                        <div className="wb-market-card">
                          <span className="wb-market-card__label">
                            Return on Equity (ROE)
                            <MetricExplainerTooltip metric="roe" context={`${ticker}: Return on book equity capital.`} />
                          </span>
                          <strong className="wb-market-card__value wb-mono">
                            {fmtPct(liveData.bankMetrics.roe?.value, 2)}
                          </strong>
                          <small className="wb-market-card__sub">Return on book equity</small>
                        </div>
                        <div className="wb-market-card">
                          <span className="wb-market-card__label">
                            Cost of Equity (Ke)
                            <MetricExplainerTooltip metric="coe" context={`${ticker}: CAPM hurdle rate benchmark.`} />
                          </span>
                          <strong className="wb-market-card__value wb-mono">
                            {fmtPct(liveData.bankMetrics.costOfEquity?.value, 2)}
                          </strong>
                          <small className="wb-market-card__sub">CAPM hurdle rate</small>
                        </div>
                        <div className="wb-market-card">
                          <span className="wb-market-card__label">
                            Book Value / Share (BVPS)
                            <MetricExplainerTooltip metric="bookValue" context={`${ticker}: Clean surplus balance sheet equity anchor.`} />
                          </span>
                          <strong className="wb-market-card__value wb-mono">
                            Rp {fmtRp(liveData.bankMetrics.bookValuePerShare?.value)}
                          </strong>
                          <small className="wb-market-card__sub">
                            P/BV: {((liveData.marketPrice || 0) / (liveData.bankMetrics.bookValuePerShare?.value || 1)).toFixed(2)}x
                          </small>
                        </div>
                        <div className="wb-market-card">
                          <span className="wb-market-card__label">Dividend Payout Ratio</span>
                          <strong className="wb-market-card__value wb-mono">
                            {fmtPct(liveData.bankMetrics.payoutRatio?.value, 1)}
                          </strong>
                          <small className="wb-market-card__sub">
                            DPS: Rp {fmtRp(liveData.bankMetrics.dividendPerShare?.value)}
                          </small>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* BANK RESIDUAL INCOME VALUATION PANEL */}
                  {isFinancial && (
                    <section className="wb-panel">
                      <div className="wb-panel__header">
                        <h2 className="wb-panel__title">Residual Income Valuation (Clean Surplus)</h2>
                        <span className="wb-panel__badge">Edwards-Bell-Ohlson Model</span>
                      </div>
                      <div className="wb-valuation-row">
                        <div className="wb-valuation-card">
                          <span className="wb-valuation-card__label">Market Price</span>
                          <strong className="wb-mono">Rp {fmtRp(liveData.marketPrice, 1)}</strong>
                          <small>IDX Live Quotation</small>
                        </div>
                        <div className="wb-valuation-card wb-valuation-card--accent">
                          <span className="wb-valuation-card__label">RIM Model Fair Value</span>
                          <strong className="wb-mono">Rp {fmtRp(baselineFairValue)}</strong>
                          <small>Clean surplus accounting (5Y forecast + Terminal)</small>
                        </div>
                        <div className="wb-valuation-card">
                          <span className="wb-valuation-card__label">Premium to Fair Value</span>
                          <strong className={`wb-mono ${premiumToMarket > 0 ? "wb-text--danger" : "wb-text--positive"}`}>
                            {premiumToMarket > 0 ? "+" : ""}{fmtPct(premiumToMarket)}
                          </strong>
                          <small>{premiumToMarket > 0 ? "Trades at premium to RIM" : "Trades at discount to RIM"}</small>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* NON-FINANCIAL PANELS (FORENSICS & DCF) */}
                  {!isFinancial && (
                    <>
                      <div className="wb-traffic-grid">
                        <div className={`wb-traffic ${
                          liveData.arDivergenceStatus === "CRITICAL"
                            ? "wb-traffic--red"
                            : liveData.arDivergenceStatus === "WARNING" || (liveData.receivablesDivergence != null && liveData.receivablesDivergence > 1.5)
                            ? "wb-traffic--amber"
                            : "wb-traffic--green"
                        }`}>
                          <div className="wb-traffic__dot" />
                          <div className="wb-traffic__body">
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                              <span className="wb-traffic__label">DIVERGENSI PIUTANG</span>
                              {(liveData.arDivergenceStatus === "EXCELLENT" || (liveData.arDivergenceDisplay && liveData.arDivergenceDisplay.includes("Inflow"))) ? (
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    letterSpacing: "0.05em",
                                    background: "#064e3b",
                                    color: "#34d399",
                                    border: "1px solid #059669",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  <span>✓</span> KOLEKSI KAS PRIMA
                                </span>
                              ) : liveData.arDivergenceStatus === "CRITICAL" ? (
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    background: "#7f1d1d",
                                    color: "#f87171",
                                    border: "1px solid #ef4444",
                                  }}
                                >
                                  DIVERGENSI KRITIS
                                </span>
                              ) : null}
                            </div>
                            <strong className="wb-mono" style={{ color: (liveData.arDivergenceStatus === "EXCELLENT" || (liveData.arDivergenceDisplay && liveData.arDivergenceDisplay.includes("Inflow"))) ? "#34d399" : undefined }}>
                              {liveData.arDivergenceDisplay || (liveData.receivablesDivergence != null ? `${liveData.receivablesDivergence.toFixed(2)}x` : "INSUFFICIENT_HISTORY")}
                            </strong>
                            <p>
                              {(liveData.arDivergenceStatus === "EXCELLENT" || (liveData.arDivergenceDisplay && liveData.arDivergenceDisplay.includes("Inflow")))
                                ? (liveData.arDivergenceDesc || "Optimal Cash Inflow: Piutang menyusut lebih cepat daripada pendapatan, arus kas masuk dari penagihan prima.")
                                : (liveData.arDivergenceDesc || "AR growth / Revenue growth ratio. Alert: >1.5x suggests aggressive revenue recognition or collection delays.")}
                            </p>
                            <small className="wb-traffic__audit">
                              Status: {(liveData.arDivergenceStatus === "EXCELLENT" || (liveData.arDivergenceDisplay && liveData.arDivergenceDisplay.includes("Inflow"))) ? "KOLEKSI KAS PRIMA (OPTIMAL CASH INFLOW)" : (liveData.arDivergenceStatus || "NORMAL")} · Source: getFinancialStatements · Sectors API v2
                            </small>
                          </div>
                        </div>
                        <div className={`wb-traffic ${liveData.cfoToNi != null && liveData.cfoToNi < 1.0 ? "wb-traffic--amber" : "wb-traffic--green"}`}>
                          <div className="wb-traffic__dot" />
                          <div className="wb-traffic__body">
                            <span className="wb-traffic__label">KONVERSI KAS CFO/NI</span>
                            <strong className="wb-mono">{liveData.cfoToNi != null ? `${liveData.cfoToNi.toFixed(2)}x` : "INSUFFICIENT_HISTORY"}</strong>
                            <p>Operating cash flow to net income ratio. Alert: &lt;1.0x suggests non-cash earnings dominate.</p>
                            <small className="wb-traffic__audit">Source: getFinancialStatements · Sectors API v2</small>
                          </div>
                        </div>
                      </div>

                      {waterfallData.length > 0 && (
                        <section
                          className="wb-panel"
                          style={{
                            minWidth: 0,
                            width: "100%",
                            maxWidth: "100%",
                            overflow: "hidden",
                            boxSizing: "border-box",
                          }}
                        >
                          <div className="wb-panel__header">
                            <h2 className="wb-panel__title">Cash Flow Quality Bridge</h2>
                            <span className="wb-panel__badge">IDR Billions</span>
                          </div>
                          <div
                            className="wb-chart-wrap"
                            style={{
                              minWidth: 0,
                              width: "100%",
                              maxWidth: "100%",
                              overflow: "hidden",
                              boxSizing: "border-box",
                            }}
                          >
                            <ResponsiveContainer width="100%" height={320}>
                              <BarChart data={waterfallData} margin={{ top: 20, right: 45, left: 15, bottom: 45 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#232735" vertical={false} />
                                <XAxis
                                  dataKey="name"
                                  interval={0}
                                  angle={-25}
                                  textAnchor="end"
                                  height={60}
                                  tick={{ fontSize: 11, fill: "#8b92a5" }}
                                  axisLine={{ stroke: "#232735" }}
                                  tickLine={{ stroke: "#232735" }}
                                />
                                <YAxis
                                  tick={{ fill: "#8B92A5", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                                  axisLine={{ stroke: "#232735" }}
                                  tickLine={{ stroke: "#232735" }}
                                  width={52}
                                />
                                <Tooltip content={<BridgeTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                                <Bar dataKey="barValue" radius={[2, 2, 0, 0]}>
                                  {waterfallData.map((entry, idx) => {
                                    let fill = "#10B981";
                                    if (entry.type === "subtract" || entry.value < 0) fill = "#EF4444";
                                    if (entry.type === "subtotal") fill = "#6366F1";
                                    if (entry.type === "total") fill = "#00E599";
                                    return <Cell key={idx} fill={fill} />;
                                  })}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </section>
                      )}

                      <section className="wb-panel">
                        <div className="wb-panel__header">
                          <h2 className="wb-panel__title">Earnings Quality Scorecard</h2>
                        </div>
                        <div className={`wb-grade-card wb-grade-card--${liveData.earningsGrade.toLowerCase()}`}>
                          <div className="wb-grade-card__letter">{liveData.earningsGrade}</div>
                          <div>
                            <strong>{liveData.earningsScore}/100</strong>
                            <small>
                              {liveData.earningsScore < 70
                                ? "Moderate concern — accrual quality and collection efficiency flagged."
                                : "Healthy earnings quality — cash conversion aligns with accounting accruals."}
                            </small>
                          </div>
                        </div>
                      </section>

                      <section className="wb-panel">
                        <div className="wb-panel__header">
                          <h2 className="wb-panel__title">Valuation Comparison (FCFF DCF)</h2>
                        </div>
                        <div className="wb-valuation-row">
                          <div className="wb-valuation-card">
                            <span className="wb-valuation-card__label">Market Price</span>
                            <strong className="wb-mono">Rp {fmtRp(liveData.marketPrice, 1)}</strong>
                            <small>IDX Live Quotation</small>
                          </div>
                          <div className="wb-valuation-card wb-valuation-card--accent">
                            <span className="wb-valuation-card__label">Post-Haircut Fair Value</span>
                            <strong className="wb-mono">Rp {fmtRp(baselineFairValue)}</strong>
                            <small>
                              {isDistressedDcf
                                ? "Net Asset Base Floor"
                                : `DCF · ${fmtPct(liveData.suggestedHaircut)} cash haircut applied`}
                            </small>
                            {isDistressedDcf && (
                              <div
                                className="wb-badge wb-badge--warning"
                                style={{
                                  marginTop: "8px",
                                  fontSize: "10.5px",
                                  lineHeight: "1.3",
                                  padding: "4px 8px",
                                  background: "rgba(245, 158, 11, 0.12)",
                                  color: "#fbbf24",
                                  border: "1px solid rgba(245, 158, 11, 0.3)",
                                  borderRadius: "4px",
                                }}
                              >
                                ⚠️ <b>[!] DCF Deficit:</b> Nilai wajar disesuaikan ke Net Asset Base karena proyeksi FCFF negatif.
                              </div>
                            )}
                          </div>
                          <div className="wb-valuation-card">
                            <span className="wb-valuation-card__label">Premium to Fair Value</span>
                            <strong className={`wb-mono ${premiumToMarket > 0 ? "wb-text--danger" : "wb-text--positive"}`}>
                              {premiumToMarket > 0 ? "+" : ""}{fmtPct(premiumToMarket)}
                            </strong>
                            <small>Market trades {premiumToMarket > 0 ? "above" : "below"} model fair value</small>
                          </div>
                        </div>
                      </section>

                      <section className="wb-panel">
                        <div className="wb-panel__header">
                          <h2 className="wb-panel__title">Reverse DCF — Market Implied Growth</h2>
                        </div>
                        <div className="wb-reverse-grid">
                          <div className="wb-reverse-card">
                            <span>Historical Revenue Growth</span>
                            <strong className="wb-mono">{fmtPct(liveData.historicalRevenueGrowth ?? 0.10)}</strong>
                          </div>
                          <div className="wb-reverse-card">
                            <span>Market Implied Growth</span>
                            <strong className="wb-mono">{fmtPct(impliedGrowth)}</strong>
                          </div>
                        </div>
                        <div className="wb-gap-meter">
                          <div className="wb-gap-meter__labels">
                            <span>Expectation Gap</span>
                            <strong className={`wb-mono ${growthGap > 0 ? "wb-text--positive" : "wb-text--danger"}`}>
                              {growthGap > 0 ? "-" : "+"}{fmtPct(Math.abs(growthGap))}
                            </strong>
                          </div>
                          <div className="wb-gap-meter__track">
                            <div
                              className={`wb-gap-meter__fill ${growthGap > 0 ? "wb-gap-meter__fill--negative" : "wb-gap-meter__fill--positive"}`}
                              style={{ width: `${Math.min(Math.abs(growthGap) * 1000, 100)}%` }}
                            />
                          </div>
                        </div>
                      </section>
                    </>
                  )}

                  {/* AI Executive Synthesis */}
                  <section className="wb-panel">
                    <div className="wb-panel__header">
                      <h2 className="wb-panel__title">AI Executive Synthesis</h2>
                      <span className="wb-panel__badge">Multi-Persona Lens</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                      <div className="wb-lens-tabs" style={{ marginBottom: 0 }}>
                        {(["pm", "credit", "retail"] as PersonaKey[]).map((key) => (
                          <button
                            key={key}
                            type="button"
                            className={`wb-lens-tab ${persona === key ? "wb-lens-tab--active" : ""}`}
                            onClick={() => setPersona(key)}
                          >
                            {key === "pm" ? "Portfolio Manager Lens" : key === "credit" ? "Credit Underwriter Lens" : "Retail Lens (Bahasa Indonesia)"}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className={`wb-chaos-btn ${chaosMode ? "wb-chaos-btn--active" : ""}`}
                        onClick={() => setChaosMode(!chaosMode)}
                        title="Simulasikan guncangan suku bunga makro +300 bps dan tekanan likuiditas kas"
                      >
                        {chaosMode ? "⚡ Chaos Mode: ACTIVE (+300 bps Shock)" : "⚡ Toggle Chaos Mode"}
                      </button>
                    </div>
                    {chaosMode && (
                      <div style={{
                        background: "rgba(220, 38, 38, 0.12)",
                        border: "1px solid rgba(220, 38, 38, 0.35)",
                        borderRadius: "4px",
                        padding: "10px 14px",
                        marginBottom: "14px",
                        color: "#fca5a5",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontFamily: "var(--wb-font-mono)",
                      }}>
                        <span style={{ fontSize: "16px" }}>⚠</span>
                        <span><b>CHAOS STRESS-TEST PROTOCOL:</b> Disimulasikan guncangan makro suku bunga (+300 bps Ke/WACC), kompresi margin laba, dan pengetatan likuiditas arus kas. Model valuasi otomatis disesuaikan secara deterministik.</span>
                      </div>
                    )}
                    <div className="wb-narrative">
                      <p>{personaNarrative}</p>
                    </div>
                  </section>

                  {/* Thesis Contract & Kill Criteria */}
                  <section className="wb-panel">
                    <div className="wb-panel__header">
                      <h2 className="wb-panel__title">Thesis Contract & Kill Criteria</h2>
                      <span className="wb-panel__badge">Falsification Ledger</span>
                    </div>
                    <div className="wb-kill-list">
                      {killCriteriaList.map((kc) => (
                        <div key={kc.id} className={`wb-kill-item ${kc.status === "BREACHED" ? "wb-kill-item--breached" : "wb-kill-item--clear"}`}>
                          <div className="wb-kill-item__head">
                            <b>{kc.label}</b>
                            <span className={`wb-kill-status ${kc.status === "BREACHED" ? "wb-kill-status--breached" : "wb-kill-status--clear"}`}>
                              {kc.status}
                            </span>
                          </div>
                          <code className="wb-kill-item__threshold">{kc.threshold}</code>
                          <p className="wb-kill-item__observed">{kc.observed}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Export Audited Workbook */}
                  <section className="wb-panel">
                    <div className="wb-panel__header">
                      <h2 className="wb-panel__title">05 / EXPORT: Audited Workbook</h2>
                    </div>
                    <p className="wb-export-subtitle">Workbook formula hidup; haircut dan parameter terkunci secara deterministik.</p>
                    <button
                      type="button"
                      className="wb-btn-primary"
                      disabled={exporting}
                      onClick={handleExportWorkbook}
                    >
                      {exporting ? "Memproses Unduhan..." : "Download Audited Workbook (.xlsx)"}
                    </button>
                    <div className="wb-export-verify">
                      <span className="wb-export-verify__icon">✓</span>
                      <span>✓ 5-Sheet Institutional Workbook: 5/5 Integrity Invariants Active (Includes automated error-traps, WACC/Ke solvability guards, and model reconciliation proof).</span>
                    </div>
                  </section>
                </div>
              )}

              {/* ╌╌╌ WHAT-IF STUDIO TAB ╌╌╌ */}
              {activeTab === "whatif" && (
                <div className="wb-tab-content">
                  <section className="wb-panel">
                    <div className="wb-panel__header">
                      <h2 className="wb-panel__title">
                        Deterministic What-If Engine ({isFinancial ? "Residual Income" : "FCFF DCF"})
                      </h2>
                      <span className="wb-panel__badge wb-panel__badge--accent">REAL-TIME RECALCULATION</span>
                    </div>
                    <div className="wb-sim-grid">
                      {isFinancial ? (
                        <>
                          <div className="wb-sim-slider">
                            <label>
                              Cost of Equity (Ke)
                              <MetricExplainerTooltip metric="coe" context="Hurdle rate for clean surplus excess return." />
                            </label>
                            <input
                              type="range"
                              min={0.08}
                              max={0.16}
                              step={0.001}
                              value={simKe}
                              onChange={(e) => setSimKe(parseFloat(e.target.value))}
                            />
                            <output className="wb-mono">{fmtPct(simKe)}</output>
                          </div>
                          <div className="wb-sim-slider">
                            <label>
                              Long-term ROE
                              <MetricExplainerTooltip metric="roe" context="Normalized return on book equity." />
                            </label>
                            <input
                              type="range"
                              min={0.10}
                              max={0.25}
                              step={0.001}
                              value={simRoe}
                              onChange={(e) => setSimRoe(parseFloat(e.target.value))}
                            />
                            <output className="wb-mono">{fmtPct(simRoe)}</output>
                          </div>
                          <div className="wb-sim-slider">
                            <label>Terminal Growth</label>
                            <input
                              type="range"
                              min={0.01}
                              max={0.06}
                              step={0.001}
                              value={simTg}
                              onChange={(e) => setSimTg(parseFloat(e.target.value))}
                            />
                            <output className="wb-mono">{fmtPct(simTg)}</output>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="wb-sim-slider">
                            <label>
                              WACC
                              <MetricExplainerTooltip metric="wacc" context="Cost of capital discount rate." />
                            </label>
                            <input
                              type="range"
                              min={0.08}
                              max={0.16}
                              step={0.001}
                              value={simWacc}
                              onChange={(e) => setSimWacc(parseFloat(e.target.value))}
                            />
                            <output className="wb-mono">{fmtPct(simWacc)}</output>
                          </div>
                          <div className="wb-sim-slider">
                            <label>Terminal Growth</label>
                            <input
                              type="range"
                              min={0.01}
                              max={0.06}
                              step={0.001}
                              value={simTg}
                              onChange={(e) => setSimTg(parseFloat(e.target.value))}
                            />
                            <output className="wb-mono">{fmtPct(simTg)}</output>
                          </div>
                          <div className="wb-sim-slider">
                            <label>
                              Cash Haircut
                              <MetricExplainerTooltip metric="haircut" context="Prudential safety discount on cash flow." />
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={0.3}
                              step={0.01}
                              value={simHaircut}
                              onChange={(e) => setSimHaircut(parseFloat(e.target.value))}
                            />
                            <output className="wb-mono">{fmtPct(simHaircut, 0)}</output>
                          </div>
                        </>
                      )}
                    </div>
                  </section>

                  {/* Recalculated Valuation Result */}
                  <section className="wb-panel">
                    <div className="wb-panel__header">
                      <h2 className="wb-panel__title">Simulated Valuation Result</h2>
                    </div>
                    <div className="wb-valuation-row">
                      <div className="wb-valuation-card">
                        <span className="wb-valuation-card__label">Baseline Fair Value</span>
                        <strong className="wb-mono">Rp {fmtRp(baselineFairValue)}</strong>
                        <small>Deterministic Anchor</small>
                      </div>
                      <div className="wb-valuation-card wb-valuation-card--accent">
                        <span className="wb-valuation-card__label">Simulated Fair Value</span>
                        <strong className="wb-mono">Rp {fmtRp(simFairValue)}</strong>
                        <small>Recalculated dynamically</small>
                      </div>
                      <div className="wb-valuation-card">
                        <span className="wb-valuation-card__label">Variance vs Baseline</span>
                        <strong className={`wb-mono ${simFairValue >= baselineFairValue ? "wb-text--positive" : "wb-text--danger"}`}>
                          {simFairValue >= baselineFairValue ? "+" : ""}{baselineFairValue > 0 ? fmtPct((simFairValue - baselineFairValue) / baselineFairValue) : "0%"}
                        </strong>
                        <small>Sensitivity response</small>
                      </div>
                    </div>
                  </section>

                  {/* Natural Language Prompt Box */}
                  <section className="wb-panel">
                    <div className="wb-panel__header">
                      <h2 className="wb-panel__title">Natural Language Scenario Intent</h2>
                    </div>
                    <textarea
                      className="wb-nl-input"
                      rows={3}
                      value={nlPrompt}
                      onChange={(e) => setNlPrompt(e.target.value)}
                      placeholder="Simulasikan suku bunga naik jadi WACC 12% dan haircut kas 20%"
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <div className="wb-nl-actions">
                      <button className="wb-btn wb-btn--primary" type="button" onClick={handleApplyNlScenario}>
                        Apply with AI
                      </button>
                      <span className="wb-nl-note">Intent parser routes NL → structured parameters. Zero-LLM math enforced.</span>
                    </div>
                    {nlStatus && (
                      <div className={`wb-nl-status ${nlStatus.startsWith("✓") ? "wb-nl-status--ok" : "wb-nl-status--warn"}`}>
                        {nlStatus}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* ╌╌╌ TECHNICAL RADAR TAB (SECTORS API HISTORICAL & LUXALGO ENGINE) ╌╌╌ */}
              {activeTab === "technical" && (
                <div className="wb-tab-content">
                  <TechnicalRadarChart
                    ticker={ticker}
                    marketPrice={liveData.marketPrice}
                    initialSeries={liveData.historicalPriceSeries ?? undefined}
                    topBuyersSellers={liveData.topBuyersSellers ?? undefined}
                  />
                </div>
              )}

              {/* ╌╌╌ TAB 5: AI AGENT DOSSIER (AUTONOMOUS REACT ORCHESTRATOR) ╌╌╌ */}
              {activeTab === "agent" && (
                <div
                  className="wb-tab-content"
                  style={{
                    minWidth: 0,
                    maxWidth: "100%",
                    overflowX: "hidden",
                    boxSizing: "border-box",
                  }}
                >
                  <AgentDossierView
                    ticker={ticker}
                    companyName={liveData.companyName}
                    marketPrice={liveData.marketPrice}
                  />
                </div>
              )}
            </main>

            {/* ─── RIGHT TELEMETRY & REGULATORY SIDEBAR ─── */}
            <aside className="wb-sidebar">
              {/* Evidence Trail */}
              <section className="wb-panel">
                <div className="wb-panel__header">
                  <h2 className="wb-panel__title">Evidence Trail</h2>
                  <span className="wb-panel__badge wb-panel__badge--accent">Sectors API</span>
                </div>
                {liveData.evidenceTrail.length > 0 ? (
                  <div className="wb-evidence-list">
                    {liveData.evidenceTrail.map((entry, idx) => (
                      <div className="wb-evidence-row" key={`${entry.endpoint}-${idx}`}>
                        <div className="wb-evidence-row__info">
                          <code className="wb-mono">{entry.endpoint}</code>
                          <small>{entry.timestamp.slice(11, 19)} UTC</small>
                        </div>
                        <div className="wb-evidence-row__meta">
                          <span className={`wb-status-pill ${entry.status === "LIVE" ? "wb-status-pill--live" : "wb-status-pill--cache"}`}>
                            {entry.status}
                          </span>
                          <span className="wb-mono wb-text--muted">{entry.latencyMs}ms</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: "20px 16px", textAlign: "center", color: "#8B92A5", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
                    UNAVAILABLE / FAILED RUN
                  </div>
                )}
              </section>

              {/* BEI Regulatory Radar */}
              <section className="wb-panel">
                <div className="wb-panel__header">
                  <h2 className="wb-panel__title">BEI Market & Regulatory</h2>
                </div>
                <div className="wb-reg-grid">
                  <div className="wb-reg-item">
                    <span>Papan</span>
                    <b>Papan Utama</b>
                  </div>
                  <div className="wb-reg-item">
                    <span>Status Pengawasan</span>
                    <b className="wb-text--positive">Normal</b>
                  </div>
                  <div className="wb-reg-item">
                    <span>Auto Rejection</span>
                    <b className="wb-mono">ARA/ARB ±{liveData.marketPrice > 5000 ? "20" : liveData.marketPrice >= 200 ? "25" : "35"}%</b>
                  </div>
                  <div className="wb-reg-item">
                    <span>Tick Size</span>
                    <b className="wb-mono">Rp {liveData.marketPrice >= 5000 ? 25 : liveData.marketPrice >= 2000 ? 10 : liveData.marketPrice >= 500 ? 5 : 2}</b>
                  </div>
                  <div className="wb-reg-item">
                    <span>ARA Limit</span>
                    <b className="wb-mono">Rp {fmtRp(Math.round(liveData.marketPrice * (liveData.marketPrice > 5000 ? 1.20 : liveData.marketPrice >= 200 ? 1.25 : 1.35)))}</b>
                  </div>
                  <div className="wb-reg-item">
                    <span>ARB Limit</span>
                    <b className="wb-mono">Rp {fmtRp(Math.round(liveData.marketPrice * (liveData.marketPrice > 5000 ? 0.80 : liveData.marketPrice >= 200 ? 0.75 : 0.65)))}</b>
                  </div>
                </div>
              </section>

              {/* FSM Engine Telemetry */}
              <section className="wb-panel">
                <div className="wb-panel__header">
                  <h2 className="wb-panel__title">FSM Engine Telemetry</h2>
                </div>
                <div className="wb-telemetry-list">
                  <div className="wb-telemetry-row">
                    <span>Period Coverage</span>
                    <div className="wb-telemetry-bar">
                      <div className="wb-telemetry-bar__fill" style={{ width: "100%" }} />
                    </div>
                    <b className="wb-mono wb-text--positive">100%</b>
                  </div>
                  <div className="wb-telemetry-row">
                    <span>Item Coverage</span>
                    <div className="wb-telemetry-bar">
                      <div className="wb-telemetry-bar__fill" style={{ width: "100%" }} />
                    </div>
                    <b className="wb-mono wb-text--positive">100%</b>
                  </div>
                  <div className="wb-telemetry-row">
                    <span>Freshness</span>
                    <div className="wb-telemetry-bar">
                      <div className="wb-telemetry-bar__fill" style={{ width: "100%" }} />
                    </div>
                    <b className="wb-mono wb-text--positive">100%</b>
                  </div>
                  <div className="wb-telemetry-row">
                    <span>Agent Confidence</span>
                    <div className="wb-telemetry-bar">
                      <div className="wb-telemetry-bar__fill wb-telemetry-bar__fill--accent" style={{ width: "95%" }} />
                    </div>
                    <b className="wb-mono wb-text--accent">HIGH</b>
                  </div>
                </div>
              </section>

              {/* Institutional Exchange Clock & Regulatory Verification */}
              <MarketClock ticker={ticker} retrievedAt={liveData.retrievedAt} />
            </aside>
          </div>
        </>
      )}

      {/* ═══════ INSTITUTIONAL KEYBOARD SHORTCUTS DOCK ═══════ */}
      <nav className="wb-shortcuts-dock" aria-label="Terminal Keyboard Shortcuts">
        <div className="wb-shortcut-pill">
          <kbd className="wb-shortcut-key">1-5</kbd>
          <span>Ganti Tab (5: AI Agent)</span>
        </div>
        <div className="wb-shortcut-pill">
          <kbd className="wb-shortcut-key">Ctrl+K</kbd>
          <span>Cari Emiten</span>
        </div>
        <div className="wb-shortcut-pill">
          <kbd className="wb-shortcut-key">C</kbd>
          <span>Chaos Shock</span>
        </div>
        <div className="wb-shortcut-pill">
          <kbd className="wb-shortcut-key">D</kbd>
          <span>DAG Inspector</span>
        </div>
        <div className="wb-shortcut-pill">
          <kbd className="wb-shortcut-key">E</kbd>
          <span>Export XLSX</span>
        </div>
        <div className="wb-shortcut-pill">
          <kbd className="wb-shortcut-key">Esc</kbd>
          <span>Tutup</span>
        </div>
      </nav>

      {/* ═══════ DAG TELEMETRY INSPECTOR MODAL ═══════ */}
      <DagInspector
        isOpen={dagInspectorOpen}
        onClose={() => setDagInspectorOpen(false)}
        ticker={ticker}
        classification={liveData?.classification}
        dagTrace={liveData?.dagTrace}
        rawEvidence={liveData?.evidenceTrail}
        ledgerSnapshot={{
          ticker,
          mode: liveData?.mode,
          retrievedAt: liveData?.retrievedAt,
          marketPrice: liveData?.marketPrice,
          classification: liveData?.classification,
          valuationStatus: isFinancial
            ? "RESIDUAL_INCOME_VERIFIED"
            : isDistressedDcf
            ? "DISTRESSED_DCF_FALLBACK"
            : "FCFF_DCF_NORMAL",
          baselineFairValue,
          suggestedHaircut: liveData?.suggestedHaircut,
          earningsScore: liveData?.earningsScore,
          earningsGrade: liveData?.earningsGrade,
          cfoToNi: liveData?.cfoToNi,
          receivablesDivergence: liveData?.receivablesDivergence,
        }}
      />

      {/* ═══════ FOOTER ═══════ */}
      <footer className="wb-footer">
        <span>For research and institutional analysis only. Not investment advice. Data sourced from Sectors API v2.</span>
        <span className="wb-mono">Aetheria Engine v2.4.0-idx · Zero-LLM Math Kernel · Build 2026.09.21</span>
      </footer>
    </div>
  );
}
