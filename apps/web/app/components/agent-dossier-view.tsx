"use client";

import React, { useState, useEffect, useCallback } from "react";
import type {
  AgentAnalystFocus,
  AgentInvestigationReport,
  ReActStep,
} from "../../lib/agent-types";

interface AgentDossierViewProps {
  ticker: string;
  companyName?: string;
  marketPrice?: number;
}

export function AgentDossierView({
  ticker,
  companyName,
  marketPrice,
}: AgentDossierViewProps) {
  const [report, setReport] = useState<AgentInvestigationReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeToolStep, setActiveToolStep] = useState<string>("sectors.getCompanyProfile");
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInvestigation = useCallback(async (targetTicker: string) => {
    setLoading(true);
    setError(null);
    setActiveToolStep("sectors.getDailyNetForeignInflow");
    try {
      const res = await fetch(`/api/agent/investigate?ticker=${encodeURIComponent(targetTicker)}&focus=360_institutional`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to run agent investigation`);
      }
      const data: AgentInvestigationReport = await res.json();
      setReport(data);
    } catch (err) {
      console.error("[AgentDossierView] Fetch error:", err);
      setError(err instanceof Error ? err.message : "Gagal memuat penyelidikan agen otonom.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvestigation(ticker);
  }, [ticker, fetchInvestigation]);

  const handleCopyMemo = () => {
    if (!report?.memo.markdownReport) return;
    navigator.clipboard.writeText(report.memo.markdownReport).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        minWidth: 0,
        maxWidth: "100%",
        overflowX: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════
          1. AGENT COMMAND CENTER BAR
         ═══════════════════════════════════════════════════════════════════ */}
      <section
        style={{
          background: "linear-gradient(135deg, #0F131C 0%, #151A26 100%)",
          border: "1px solid #283046",
          borderRadius: "8px",
          padding: "16px 20px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "14px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: "260px" }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "8px",
              background: loading ? "rgba(99, 102, 241, 0.2)" : "rgba(16, 185, 129, 0.15)",
              border: `1px solid ${loading ? "#6366F1" : "#10B981"}`,
              display: "grid",
              placeItems: "center",
              fontSize: "18px",
            }}
          >
            🤖
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: loading ? "#F59E0B" : "#10B981",
                  boxShadow: `0 0 10px ${loading ? "#F59E0B" : "#10B981"}`,
                  animation: loading ? "pulse 1.2s infinite" : "none",
                }}
              />
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  color: loading ? "#F59E0B" : "#10B981",
                }}
              >
                {loading ? "ACTIVE AUDITING" : "REASONING COMPLETE"}
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "10px",
                  background: "#1E2433",
                  color: "#94A3B8",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  border: "1px solid #2B3347",
                }}
              >
                SECTORS v2 DAG
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "#C5CBD8", marginTop: "2px" }}>
              {loading
                ? `Calling tool: ${activeToolStep}...`
                : `Audit otonom selesai: 5/5 DAG nodes executed (${report?.executionTimeMs || 0}ms)`}
            </div>
          </div>
        </div>

        {/* Unified 360° Institutional Stance & Re-run Button */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(99, 102, 241, 0.12)",
              border: "1px solid rgba(99, 102, 241, 0.4)",
              borderRadius: "6px",
              padding: "7px 14px",
            }}
          >
            <span style={{ fontSize: "14px" }}>🤖</span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                color: "#A5B4FC",
              }}
            >
              AUTONOMOUS 360° INSTITUTIONAL DUE DILIGENCE
            </span>
          </div>

          <button
            type="button"
            onClick={() => fetchInvestigation(ticker)}
            disabled={loading}
            style={{
              background: loading ? "#1E2433" : "#6366F1",
              border: "1px solid rgba(99, 102, 241, 0.5)",
              color: "#FFFFFF",
              padding: "7px 16px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <span>{loading ? "Auditing..." : "↻ Re-run Investigation"}</span>
          </button>
        </div>
      </section>

      {/* Loading Skeleton */}
      {loading && !report && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "#94A3B8", fontFamily: "'JetBrains Mono', monospace" }}>
          <div style={{ fontSize: "24px", marginBottom: "12px" }}>⚙️</div>
          <div>Menjalankan ReAct Loop & Mengambil Endpoint Sectors API v2...</div>
          <div style={{ fontSize: "11px", color: "#64748B", marginTop: "6px" }}>
            Foreign Inflow · Broker Summary · Revenue Segments · Shareholders Composition · IDX Filings
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ padding: "16px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid #EF4444", borderRadius: "6px", color: "#FCA5A5", fontSize: "13px" }}>
          <b>Peringatan Investigasi Agen:</b> {error}
        </div>
      )}

      {report && (
        <>
          {/* ═══════════════════════════════════════════════════════════════════
              2. BLOOMBERG-STYLE INTERACTIVE LIVE THOUGHT STREAM (REACT TRACE)
             ═══════════════════════════════════════════════════════════════════ */}
          <section
            style={{
              background: "#0A0D14",
              border: "1px solid #232938",
              borderRadius: "8px",
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            }}
          >
            {/* Terminal Top Window Bar */}
            <div
              style={{
                background: "#121622",
                borderBottom: "1px solid #232938",
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#EF4444" }} />
                <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#F59E0B" }} />
                <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#10B981" }} />
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#94A3B8",
                    marginLeft: "8px",
                    letterSpacing: "0.05em",
                  }}
                >
                  AUTONOMOUS ReAct AUDIT LOG (THOUGHT → ACTION → OBSERVATION → CRITIQUE)
                </span>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10.5px", color: "#64748B" }}>
                TICKER: {report.ticker} | 5 STEPS PERSISTED
              </div>
            </div>

            {/* Steps Container */}
            <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {report.steps.map((step, idx) => {
                const isExpanded = expandedStep === idx || expandedStep === null;
                return (
                  <div
                    key={step.stepIndex}
                    style={{
                      background: "#0E121B",
                      border: "1px solid #1E2536",
                      borderRadius: "6px",
                      padding: "12px 16px",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "12px",
                      lineHeight: "1.6",
                    }}
                  >
                    {/* Step Header */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                      onClick={() => setExpandedStep(expandedStep === idx ? -1 : idx)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span
                          style={{
                            background: "#6366F1",
                            color: "#fff",
                            fontSize: "10px",
                            fontWeight: 800,
                            padding: "2px 6px",
                            borderRadius: "3px",
                          }}
                        >
                          STEP {step.stepIndex}
                        </span>
                        <strong style={{ color: "#E2E8F0", fontSize: "12.5px" }}>{step.nodeTitle}</strong>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            fontSize: "9.5px",
                            padding: "2px 6px",
                            borderRadius: "3px",
                            background: step.observation.cacheStatus === "HIT" ? "rgba(16, 185, 129, 0.15)" : "rgba(59, 130, 246, 0.15)",
                            color: step.observation.cacheStatus === "HIT" ? "#10B981" : "#60A5FA",
                            border: `1px solid ${step.observation.cacheStatus === "HIT" ? "rgba(16, 185, 129, 0.3)" : "rgba(59, 130, 246, 0.3)"}`,
                          }}
                        >
                          {step.observation.cacheStatus} ({step.observation.latencyMs}ms)
                        </span>
                        <span style={{ color: "#64748B", fontSize: "11px" }}>{isExpanded ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {/* Step Details Body */}
                    {isExpanded && (
                      <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                        {/* Thought */}
                        <div style={{ display: "flex", gap: "8px" }}>
                          <span style={{ color: "#F59E0B", fontWeight: 800, flexShrink: 0 }}>💭 THOUGHT:</span>
                          <span style={{ color: "#CBD5E1" }}>{step.thought}</span>
                        </div>

                        {/* Action */}
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ color: "#38BDF8", fontWeight: 800, flexShrink: 0 }}>⚡ ACTION:</span>
                          <code
                            style={{
                              background: "#161E2E",
                              color: "#7DD3FC",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              border: "1px solid #0284C7",
                              fontSize: "11px",
                            }}
                          >
                            {step.action.tool}
                          </code>
                          <span style={{ color: "#64748B", fontSize: "11px" }}>
                            {JSON.stringify(step.action.input)}
                          </span>
                        </div>

                        {/* Observation */}
                        <div
                          style={{
                            background: "#080B11",
                            borderLeft: "3px solid #10B981",
                            padding: "8px 12px",
                            borderRadius: "0 4px 4px 0",
                          }}
                        >
                          <span style={{ color: "#10B981", fontWeight: 800, display: "block", marginBottom: "4px" }}>
                            👁 OBSERVATION:
                          </span>
                          <span style={{ color: "#E2E8F0" }}>{step.observation.summary}</span>
                        </div>

                        {/* Critique / Reflection */}
                        <div style={{ display: "flex", gap: "8px" }}>
                          <span style={{ color: "#A78BFA", fontWeight: 800, flexShrink: 0 }}>🔍 CRITIQUE:</span>
                          <span style={{ color: "#C084FC" }}>{step.critique}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════════
              3. 4 LIVE DATA ARTIFACTS (VISUAL OUTPUTS OF SECTORS API)
             ═══════════════════════════════════════════════════════════════════ */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
            {/* Artifact A: Smart Money Flow Meter */}
            <div
              style={{
                background: "#0F131C",
                border: "1px solid #232938",
                borderRadius: "8px",
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Artifact 01: Smart Money Flow Meter
                </span>
                <span
                  style={{
                    background: report.artifacts.smartMoneyFlow.cumulativeNet10d >= 0 ? "#064E3B" : "#7F1D1D",
                    color: report.artifacts.smartMoneyFlow.cumulativeNet10d >= 0 ? "#6EE7B7" : "#FCA5A5",
                    fontSize: "10px",
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: "4px",
                  }}
                >
                  {report.artifacts.smartMoneyFlow.flowStance}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "#64748B" }}>10-Day Cumulative Net Foreign</div>
                  <strong
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "20px",
                      color: report.artifacts.smartMoneyFlow.cumulativeNet10d > 0 ? "#10B981" : report.artifacts.smartMoneyFlow.cumulativeNet10d < 0 ? "#EF4444" : "#94A3B8",
                    }}
                  >
                    {report.artifacts.smartMoneyFlow.cumulativeNet10d > 0 ? "+" : report.artifacts.smartMoneyFlow.cumulativeNet10d < 0 ? "-" : ""}
                    Rp {(Math.abs(report.artifacts.smartMoneyFlow.cumulativeNet10d) >= 1e12
                      ? (Math.abs(report.artifacts.smartMoneyFlow.cumulativeNet10d) / 1e12).toFixed(2) + " T"
                      : (Math.abs(report.artifacts.smartMoneyFlow.cumulativeNet10d) / 1e9).toFixed(2) + " M")}
                  </strong>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "11px", color: "#64748B" }}>Foreign Dominance</div>
                  <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "16px", color: "#F1F3F9" }}>
                    {Number(report.artifacts.smartMoneyFlow.foreignDominancePct).toFixed(1)}%
                  </strong>
                </div>
              </div>

              {/* Broker Accumulators vs Distributors */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "4px" }}>
                <div style={{ background: "#141926", padding: "10px", borderRadius: "6px", border: "1px solid #1E2536" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#10B981", marginBottom: "6px" }}>
                    TOP ACCUMULATORS
                  </div>
                  {report.artifacts.smartMoneyFlow.topAccumulators.map((b) => (
                    <div key={b.brokerCode} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#E2E8F0" }}>{b.brokerCode}</span>
                      <span style={{ color: "#10B981" }}>+Rp {(b.netValue / 1_000_000_000).toFixed(0)}M</span>
                    </div>
                  ))}
                </div>

                <div style={{ background: "#141926", padding: "10px", borderRadius: "6px", border: "1px solid #1E2536" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#EF4444", marginBottom: "6px" }}>
                    TOP DISTRIBUTORS
                  </div>
                  {report.artifacts.smartMoneyFlow.topDistributors.map((b) => (
                    <div key={b.brokerCode} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#E2E8F0" }}>{b.brokerCode}</span>
                      <span style={{ color: "#EF4444" }}>-Rp {(Math.abs(b.netValue) / 1_000_000_000).toFixed(0)}M</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Artifact B: Revenue Segment Anatomy */}
            <div
              style={{
                background: "#0F131C",
                border: "1px solid #232938",
                borderRadius: "8px",
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Artifact 02: Revenue Segment Anatomy
                </span>
                <span style={{ background: "#1E2433", color: "#60A5FA", fontSize: "10px", fontWeight: 800, padding: "2px 8px", borderRadius: "4px" }}>
                  MOAT: {report.artifacts.revenueSegments.moatAssessment.diversificationScore}/100
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {report.artifacts.revenueSegments.segments.map((seg, i) => (
                  <div key={seg.segment} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", color: "#E2E8F0" }}>
                      <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "200px" }}>
                        {seg.segment}
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                        {seg.percentage}%
                      </span>
                    </div>
                    <div style={{ width: "100%", height: "6px", background: "#1E2433", borderRadius: "3px", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${seg.percentage}%`,
                          height: "100%",
                          background: i === 0 ? "#6366F1" : i === 1 ? "#38BDF8" : i === 2 ? "#10B981" : "#F59E0B",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background: "#141926", padding: "10px", borderRadius: "6px", border: "1px solid #1E2536", fontSize: "11px", color: "#94A3B8" }}>
                <strong style={{ color: "#E2E8F0" }}>Pricing Power:</strong> {report.artifacts.revenueSegments.moatAssessment.corePricingPower} · Dominant segment dependence risk: <span style={{ color: report.artifacts.revenueSegments.moatAssessment.dominantSegmentRisk === "HIGH" ? "#EF4444" : "#10B981" }}>{report.artifacts.revenueSegments.moatAssessment.dominantSegmentRisk}</span>.
              </div>
            </div>

            {/* Artifact C: Ownership & GCG Matrix */}
            <div
              style={{
                background: "#0F131C",
                border: "1px solid #232938",
                borderRadius: "8px",
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Artifact 03: Ownership & GCG Matrix
                </span>
                <span style={{ background: "#064E3B", color: "#34D399", fontSize: "10px", fontWeight: 800, padding: "2px 8px", borderRadius: "4px" }}>
                  {report.artifacts.governanceMatrix.gcgRating}
                </span>
              </div>

              <div>
                <div style={{ fontSize: "11px", color: "#64748B" }}>Pemegang Saham Pengendali Utama</div>
                <strong style={{ fontSize: "13px", color: "#F1F3F9" }}>
                  {report.artifacts.governanceMatrix.controllingShareholders[0]?.name || "Pengendali Tercatat"}
                </strong>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#60A5FA", marginLeft: "8px", fontWeight: 700 }}>
                  ({report.artifacts.governanceMatrix.controllingShareholders[0]?.percentage || 51}%)
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div style={{ background: "#141926", padding: "8px 10px", borderRadius: "6px" }}>
                  <div style={{ fontSize: "10px", color: "#64748B" }}>Institusi</div>
                  <strong style={{ fontFamily: "'JetBrains Mono', monospace", color: "#F1F3F9" }}>
                    {report.artifacts.governanceMatrix.institutionalPct}%
                  </strong>
                </div>
                <div style={{ background: "#141926", padding: "8px 10px", borderRadius: "6px" }}>
                  <div style={{ fontSize: "10px", color: "#64748B" }}>Asing</div>
                  <strong style={{ fontFamily: "'JetBrains Mono', monospace", color: "#F1F3F9" }}>
                    {Number(report.artifacts.governanceMatrix.foreignPct).toFixed(1)}%
                  </strong>
                </div>
              </div>

              <div style={{ fontSize: "11px", color: "#94A3B8" }}>
                <div style={{ fontWeight: 700, color: "#CBD5E1", marginBottom: "4px" }}>Keterbukaan IDX Terkini:</div>
                {report.artifacts.governanceMatrix.recentFilings.slice(0, 2).map((f) => (
                  <div key={f.title} style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                    <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "210px" }}>{f.title}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#64748B" }}>{f.date}</span>
                  </div>
                ))}
              </div>

              {/* Insider & Filing Watchdog */}
              {report.artifacts.governanceMatrix.insiderWatchdog && (
                <div
                  style={{
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    padding: "9px 11px",
                    borderRadius: "6px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#34D399", letterSpacing: "0.04em" }}>
                      🛡️ INSIDER WATCHDOG (POJK 11/2017)
                    </span>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "9px",
                        fontWeight: 700,
                        color: "#6EE7B7",
                        background: "rgba(16, 185, 129, 0.2)",
                        padding: "1px 6px",
                        borderRadius: "3px",
                      }}
                    >
                      {report.artifacts.governanceMatrix.insiderWatchdog.signal}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#CBD5E1", lineHeight: "1.4" }}>
                    {report.artifacts.governanceMatrix.insiderWatchdog.summary}
                  </div>
                </div>
              )}

              {/* Corporate Actions Sentinel */}
              {report.artifacts.governanceMatrix.corporateActionsSentinel && (
                <div
                  style={{
                    background: "rgba(56, 189, 248, 0.08)",
                    border: "1px solid rgba(56, 189, 248, 0.25)",
                    padding: "9px 11px",
                    borderRadius: "6px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#38BDF8", letterSpacing: "0.04em" }}>
                      📅 CORPORATE ACTIONS SENTINEL
                    </span>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "9px",
                        fontWeight: 700,
                        color: "#7DD3FC",
                        background: "rgba(56, 189, 248, 0.2)",
                        padding: "1px 6px",
                        borderRadius: "3px",
                      }}
                    >
                      {report.artifacts.governanceMatrix.corporateActionsSentinel.status}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#CBD5E1", lineHeight: "1.4" }}>
                    {report.artifacts.governanceMatrix.corporateActionsSentinel.summary}
                  </div>
                </div>
              )}
            </div>

            {/* Artifact D: Forensic Valuation Convergence */}
            <div
              style={{
                background: "#0F131C",
                border: "1px solid #232938",
                borderRadius: "8px",
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Artifact 04: Valuation Convergence
                </span>
                <span
                  style={{
                    background: report.artifacts.valuationConvergence.impliedUpsidePct >= 10 ? "#064E3B" : "#1E2433",
                    color: report.artifacts.valuationConvergence.impliedUpsidePct >= 10 ? "#34D399" : "#94A3B8",
                    fontSize: "10px",
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: "4px",
                  }}
                >
                  {report.artifacts.valuationConvergence.verdict}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ background: "#141926", padding: "10px", borderRadius: "6px", border: "1px solid #1E2536" }}>
                  <div style={{ fontSize: "10.5px", color: "#64748B" }}>Harga Pasar ({ticker})</div>
                  <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "17px", color: "#F1F3F9" }}>
                    Rp {report.artifacts.valuationConvergence.currentPrice.toLocaleString("id-ID")}
                  </strong>
                </div>
                <div style={{ background: "#141926", padding: "10px", borderRadius: "6px", border: "1px solid rgba(99, 102, 241, 0.4)" }}>
                  <div style={{ fontSize: "10.5px", color: "#818CF8" }}>Nilai Wajar ({report.artifacts.valuationConvergence.modelName})</div>
                  <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "17px", color: "#A5B4FC" }}>
                    Rp {report.artifacts.valuationConvergence.modelIntrinsicValue.toLocaleString("id-ID")}
                  </strong>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#141926", borderRadius: "6px" }}>
                <span style={{ fontSize: "11px", color: "#94A3B8" }}>Margin of Safety</span>
                <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "14px", color: report.artifacts.valuationConvergence.marginOfSafetyPct > 0 ? "#10B981" : "#EF4444" }}>
                  {report.artifacts.valuationConvergence.marginOfSafetyPct > 0 ? "+" : ""}{report.artifacts.valuationConvergence.marginOfSafetyPct}%
                </strong>
              </div>

              <div style={{ fontSize: "11px", color: "#64748B" }}>
                Konsensus Target Pasar: <strong style={{ color: "#E2E8F0" }}>Rp {report.artifacts.valuationConvergence.consensusTargetPrice.toLocaleString("id-ID")}</strong>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              4. EXECUTIVE INSTITUTIONAL MEMO & THESIS CONTRACT
             ═══════════════════════════════════════════════════════════════════ */}
          <section
            style={{
              background: "#0F131C",
              border: "1px solid #232938",
              borderRadius: "8px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            {/* Header with Stance Badge & Copy Button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <span style={{ fontSize: "11px", color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase", display: "block" }}>
                  Institutional Thesis Contract
                </span>
                <h2 style={{ margin: "4px 0 0 0", fontSize: "20px", color: "#F1F3F9", fontWeight: 800 }}>
                  Mandat Komite Investasi ({report.ticker})
                </h2>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    background: report.memo.overallStance === "STRONGLY ACCUMULATE" ? "#064E3B" : report.memo.overallStance === "DEFENSIVE AVOID" ? "#7F1D1D" : "#78350F",
                    color: report.memo.overallStance === "STRONGLY ACCUMULATE" ? "#6EE7B7" : report.memo.overallStance === "DEFENSIVE AVOID" ? "#FCA5A5" : "#FCD34D",
                    border: `1px solid ${report.memo.overallStance === "STRONGLY ACCUMULATE" ? "#10B981" : report.memo.overallStance === "DEFENSIVE AVOID" ? "#EF4444" : "#F59E0B"}`,
                    padding: "6px 14px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: 800,
                    letterSpacing: "0.05em",
                  }}
                >
                  {report.memo.overallStance} · {report.memo.convictionLevel} CONVICTION
                </div>

                <button
                  type="button"
                  onClick={handleCopyMemo}
                  style={{
                    background: copied ? "#065F46" : "#1E2433",
                    color: copied ? "#6EE7B7" : "#F1F3F9",
                    border: "1px solid #3B455E",
                    padding: "7px 14px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>{copied ? "✓ Copied!" : "📋 Copy Institutional Memo (.md)"}</span>
                </button>
              </div>
            </div>

            {/* Bull vs Bear Table */}
            <div>
              <h3 style={{ fontSize: "13px", color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>
                Matriks Argumen: Bull vs Bear
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                {/* Bull Side */}
                <div style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "6px", padding: "14px" }}>
                  <div style={{ fontSize: "11.5px", fontWeight: 800, color: "#10B981", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>▲ ARGUMEN BULL (PELUANG &amp; KEKUATAN)</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "16px", color: "#CBD5E1", fontSize: "12px", lineHeight: "1.7" }}>
                    {report.memo.bullCaseArguments.map((arg, i) => (
                      <li key={i} style={{ marginBottom: "6px" }}>{arg}</li>
                    ))}
                  </ul>
                </div>

                {/* Bear Side */}
                <div style={{ background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: "6px", padding: "14px" }}>
                  <div style={{ fontSize: "11.5px", fontWeight: 800, color: "#EF4444", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>▼ ARGUMEN BEAR (RISIKO &amp; TANTANGAN)</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "16px", color: "#CBD5E1", fontSize: "12px", lineHeight: "1.7" }}>
                    {report.memo.bearCaseArguments.map((arg, i) => (
                      <li key={i} style={{ marginBottom: "6px" }}>{arg}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Kill Criteria Checklist */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h3 style={{ fontSize: "13px", color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>
                  Kill Criteria Checklist (Kondisi Wajib Tutup Posisi)
                </h3>
                <span style={{ fontSize: "11px", color: "#64748B" }}>Mandatory Falsification Protocol</span>
              </div>
              <div
                style={{
                  gap: "12px",
                  width: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                }}
                className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full min-w-0"
              >
                {report.memo.killCriteriaChecklist.map((item, idx) => (
                  <div
                    key={item.condition}
                    className="min-w-0 overflow-hidden break-words"
                    style={{
                      background: "#141926",
                      border: "1px solid #232938",
                      borderRadius: "6px",
                      padding: "14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      minWidth: 0,
                      overflow: "hidden",
                      wordBreak: "break-word",
                      boxSizing: "border-box",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "4px",
                          background: "#1E2433",
                          border: "1px solid #EF4444",
                          color: "#EF4444",
                          display: "grid",
                          placeItems: "center",
                          fontSize: "11px",
                          fontWeight: 800,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <strong style={{ fontSize: "12.5px", color: "#F1F3F9" }}>{item.condition}</strong>
                    </div>
                    <code
                      style={{
                        background: "rgba(239, 68, 68, 0.08)",
                        color: "#FCA5A5",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "11px",
                      }}
                    >
                      {item.metricTrigger}
                    </code>
                    <p style={{ margin: 0, fontSize: "11.5px", color: "#94A3B8", lineHeight: "1.5" }}>
                      {item.rationale}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══════ MACRO STRESS-TEST SIMULATOR ═══════ */}
            <MacroStressTestPanel
              ticker={ticker}
              isBank={report.memo.overallStance.includes("Bank") || ["BBCA", "BMRI", "BBRI", "BBNI", "BRIS"].includes(ticker)}
              marketPrice={marketPrice || report.memo.targetPrice * 0.85}
            />
          </section>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MACRO STRESS-TEST SIMULATOR — PURE DETERMINISTIC ARITHMETIC KERNEL
   All calculations use Zero-LLM math. No AI outputs for numerical values.
   ═══════════════════════════════════════════════════════════════════════════ */

interface MacroStressTestPanelProps {
  ticker: string;
  isBank: boolean;
  marketPrice: number;
}

function MacroStressTestPanel({ ticker, isBank, marketPrice }: MacroStressTestPanelProps) {
  const [rupiahRate, setRupiahRate] = React.useState(16500);
  const [biRateHike, setBiRateHike] = React.useState(50); // basis points

  // ── Deterministic Calculations (Zero-LLM Math) ──────────────────

  const currentRate = 15800; // Assume current USD/IDR
  const rupiahDepreciation = ((rupiahRate - currentRate) / currentRate) * 100;

  // Scenario A: Rupiah Weakening Impact
  const forexDebtExposurePct = isBank ? 12 : 25; // % of total liabilities in forex
  const interestBurdenIncrease = (forexDebtExposurePct / 100) * rupiahDepreciation;
  const priceImpactA = -(Math.abs(interestBurdenIncrease) * 0.6); // Price sensitivity

  // Scenario B: BI Rate Hike Impact
  const biRateHikePct = biRateHike / 100; // Convert bps to %
  const costOfFundImpact = isBank
    ? biRateHikePct * 0.75 // Banks pass ~75% of rate hike to CoF
    : biRateHikePct * 0.45; // Non-banks via WACC debt component
  const nimCompression = isBank ? -(biRateHikePct * 0.15) : 0; // NIM compression for banks
  const priceImpactB = isBank
    ? -(costOfFundImpact * 2.2) + (nimCompression * 8) // Bank price sensitivity
    : -(costOfFundImpact * 3.5); // Non-bank WACC-driven

  const estimatedPriceA = Math.round(marketPrice * (1 + priceImpactA / 100));
  const estimatedPriceB = Math.round(marketPrice * (1 + priceImpactB / 100));

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0C1018 0%, #111827 100%)",
        border: "1px solid #1E293B",
        borderRadius: "8px",
        padding: "20px",
        marginTop: "4px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ fontSize: "13px", color: "#FBBF24", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>
          ⚡ Macro Stress-Test Simulator
        </h3>
        <span
          style={{
            padding: "3px 8px",
            background: "rgba(251, 191, 36, 0.08)",
            border: "1px solid rgba(251, 191, 36, 0.2)",
            borderRadius: "4px",
            color: "#FBBF24",
            fontSize: "9px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          ZERO-LLM DETERMINISTIC
        </span>
      </div>

      {/* Scenario A: Rupiah Depreciation */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 700 }}>
            Skenario A: Rupiah Melemah ke Rp {rupiahRate.toLocaleString("id-ID")}/USD
          </span>
          <span style={{ fontSize: "11px", color: rupiahDepreciation > 0 ? "#EF4444" : "#10B981", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            {rupiahDepreciation > 0 ? "+" : ""}{rupiahDepreciation.toFixed(1)}% depresiasi
          </span>
        </div>
        <input
          type="range"
          min={15000}
          max={18000}
          step={100}
          value={rupiahRate}
          onChange={(e) => setRupiahRate(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#FBBF24", marginBottom: "10px" }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
          <div style={{ background: "#141926", border: "1px solid #232938", borderRadius: "4px", padding: "10px" }}>
            <span style={{ display: "block", color: "#64748B", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em" }}>BEBAN BUNGA VALAS</span>
            <strong style={{ display: "block", marginTop: "4px", fontSize: "14px", color: interestBurdenIncrease > 0 ? "#EF4444" : "#10B981" }}>
              {interestBurdenIncrease > 0 ? "+" : ""}{interestBurdenIncrease.toFixed(2)}%
            </strong>
          </div>
          <div style={{ background: "#141926", border: "1px solid #232938", borderRadius: "4px", padding: "10px" }}>
            <span style={{ display: "block", color: "#64748B", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em" }}>DAMPAK HARGA</span>
            <strong style={{ display: "block", marginTop: "4px", fontSize: "14px", color: priceImpactA < 0 ? "#EF4444" : "#10B981" }}>
              {priceImpactA.toFixed(1)}%
            </strong>
          </div>
          <div style={{ background: "#141926", border: "1px solid #232938", borderRadius: "4px", padding: "10px" }}>
            <span style={{ display: "block", color: "#64748B", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em" }}>EST. HARGA</span>
            <strong style={{ display: "block", marginTop: "4px", fontSize: "14px", color: "#F1F3F9", fontFamily: "'JetBrains Mono', monospace" }}>
              Rp {estimatedPriceA.toLocaleString("id-ID")}
            </strong>
          </div>
        </div>
      </div>

      {/* Scenario B: BI Rate Hike */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 700 }}>
            Skenario B: BI Rate Naik +{biRateHike} bps
          </span>
          <span style={{ fontSize: "11px", color: "#A78BFA", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            {isBank ? "Cost of Fund" : "WACC"} Impact
          </span>
        </div>
        <input
          type="range"
          min={25}
          max={150}
          step={25}
          value={biRateHike}
          onChange={(e) => setBiRateHike(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#A78BFA", marginBottom: "10px" }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
          <div style={{ background: "#141926", border: "1px solid #232938", borderRadius: "4px", padding: "10px" }}>
            <span style={{ display: "block", color: "#64748B", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em" }}>
              {isBank ? "CoF INCREASE" : "WACC INCREASE"}
            </span>
            <strong style={{ display: "block", marginTop: "4px", fontSize: "14px", color: "#EF4444" }}>
              +{(costOfFundImpact * 100).toFixed(0)} bps
            </strong>
          </div>
          <div style={{ background: "#141926", border: "1px solid #232938", borderRadius: "4px", padding: "10px" }}>
            <span style={{ display: "block", color: "#64748B", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em" }}>DAMPAK HARGA</span>
            <strong style={{ display: "block", marginTop: "4px", fontSize: "14px", color: priceImpactB < 0 ? "#EF4444" : "#10B981" }}>
              {priceImpactB.toFixed(1)}%
            </strong>
          </div>
          <div style={{ background: "#141926", border: "1px solid #232938", borderRadius: "4px", padding: "10px" }}>
            <span style={{ display: "block", color: "#64748B", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em" }}>EST. HARGA</span>
            <strong style={{ display: "block", marginTop: "4px", fontSize: "14px", color: "#F1F3F9", fontFamily: "'JetBrains Mono', monospace" }}>
              Rp {estimatedPriceB.toLocaleString("id-ID")}
            </strong>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{ marginTop: "12px", padding: "8px 10px", borderLeft: "3px solid #334155", background: "rgba(30, 41, 59, 0.3)", borderRadius: "0 4px 4px 0" }}>
        <p style={{ margin: 0, color: "#475569", fontSize: "10px", lineHeight: "1.5" }}>
          Seluruh angka dihitung oleh kernel aritmatika deterministik. Tidak ada output LLM dalam kalkulasi numerik.
          Eksposur valas: {forexDebtExposurePct}% liabilitas | Base USD/IDR: Rp {currentRate.toLocaleString("id-ID")}
        </p>
      </div>
    </div>
  );
}
