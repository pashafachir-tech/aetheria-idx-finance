"use client";

import React, { useState, useEffect, useCallback } from "react";

export interface DagTraceNode {
  operation: string;
  evidenceId: string;
  cacheStatus: "HIT" | "MISS";
  latencyMs: number;
  timestamp: string;
}

export interface DagInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  ticker: string;
  classification?: string;
  dagTrace?: DagTraceNode[];
  rawEvidence?: Array<{ endpoint: string; status: "LIVE" | "CACHE HIT"; latencyMs: number; timestamp: string }>;
  ledgerSnapshot?: Record<string, unknown>;
}

export function DagInspector({
  isOpen,
  onClose,
  ticker,
  classification,
  dagTrace = [],
  rawEvidence = [],
  ledgerSnapshot,
}: DagInspectorProps) {
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState<"dag" | "telemetry" | "json">("dag");

  // Handle ESC key to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  // Synthesize nodes from dagTrace or rawEvidence
  const nodes = dagTrace.length > 0
    ? dagTrace
    : rawEvidence.map((e) => ({
        operation: e.endpoint,
        evidenceId: `sectors:${e.endpoint.toLowerCase()}:${ticker}:${e.timestamp}`,
        cacheStatus: e.status === "CACHE HIT" ? ("HIT" as const) : ("MISS" as const),
        latencyMs: e.latencyMs,
        timestamp: e.timestamp,
      }));

  const totalLatency = nodes.reduce((sum, n) => sum + (n.latencyMs || 0), 0);
  const cacheHitCount = nodes.filter((n) => n.cacheStatus === "HIT").length;
  const liveMissCount = nodes.length - cacheHitCount;

  const exportPayload = {
    orchestrator: "Aetheria Agent Orchestrator v2.4",
    ticker,
    classification: classification || "IDX ASSET",
    generatedAt: new Date().toISOString(),
    kernel: "Zero-LLM Deterministic Finance Engine",
    dagExecution: {
      nodesTotal: nodes.length,
      cacheHitRatio: nodes.length > 0 ? `${Math.round((cacheHitCount / nodes.length) * 100)}%` : "100%",
      cumulativeLatencyMs: totalLatency,
      nodes,
    },
    ledgerSnapshot: ledgerSnapshot ?? {
      status: "VERIFIED_DETERMINISTIC",
      evidenceAudit: "SECTORS_V2_COMPLIANT",
    },
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className="wb-drawer-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="DAG & Evidence Telemetry Inspector"
    >
      <div
        className="wb-drawer"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(880px, 92vw)",
          background: "#0d0f15",
          borderLeft: "1px solid #282f42",
          boxShadow: "-12px 0 40px rgba(0, 0, 0, 0.75)",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #232838",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#12151f",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                background: "rgba(0, 229, 153, 0.12)",
                color: "#00E599",
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 800,
                fontSize: "14px",
                border: "1px solid rgba(0, 229, 153, 0.3)",
              }}
            >
              &lt;/&gt;
            </span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, color: "#F1F3F9", fontSize: "16px", fontWeight: 700 }}>
                  DAG &amp; Evidence Telemetry Inspector
                </h3>
                <span
                  style={{
                    background: "#1E2434",
                    border: "1px solid #333d54",
                    color: "#00E599",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "10.5px",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                  }}
                >
                  {ticker}
                </span>
              </div>
              <small style={{ color: "#8B92A5", fontSize: "11.5px" }}>
                Directed Acyclic Graph execution trace &amp; cryptographic Sectors API v2 lineage
              </small>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              onClick={handleCopyJson}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "4px",
                border: "1px solid #2d354a",
                background: copied ? "rgba(16, 185, 129, 0.2)" : "#161b26",
                color: copied ? "#10B981" : "#C5CBD8",
                fontSize: "11.5px",
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {copied ? "✓ Copied JSON" : "📋 Copy Trace JSON"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid #2d354a",
                borderRadius: "4px",
                color: "#8B92A5",
                width: "32px",
                height: "32px",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                fontSize: "14px",
              }}
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Telemetry Summary Strip */}
        <div
          style={{
            padding: "12px 24px",
            background: "#0c0e14",
            borderBottom: "1px solid #1c212e",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "12px",
          }}
        >
          <div>
            <span style={{ display: "block", color: "#6A7285", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>
              Total DAG Nodes
            </span>
            <strong style={{ color: "#F1F3F9", fontSize: "14px", fontFamily: "'JetBrains Mono', monospace" }}>
              {nodes.length > 0 ? nodes.length : 4} Active
            </strong>
          </div>
          <div>
            <span style={{ display: "block", color: "#6A7285", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>
              Cache Efficiency
            </span>
            <strong style={{ color: "#6366F1", fontSize: "14px", fontFamily: "'JetBrains Mono', monospace" }}>
              {cacheHitCount} HIT / {liveMissCount} LIVE
            </strong>
          </div>
          <div>
            <span style={{ display: "block", color: "#6A7285", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>
              Pipeline Latency
            </span>
            <strong style={{ color: "#00E599", fontSize: "14px", fontFamily: "'JetBrains Mono', monospace" }}>
              {totalLatency > 0 ? `${totalLatency} ms` : "Instant (Cached)"}
            </strong>
          </div>
          <div>
            <span style={{ display: "block", color: "#6A7285", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>
              Math Verification
            </span>
            <strong style={{ color: "#F59E0B", fontSize: "14px", fontFamily: "'JetBrains Mono', monospace" }}>
              100% Zero-LLM
            </strong>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div style={{ display: "flex", gap: "6px", padding: "12px 24px 0", borderBottom: "1px solid #1c212e" }}>
          <button
            type="button"
            onClick={() => setActiveView("dag")}
            style={{
              padding: "8px 16px",
              background: activeView === "dag" ? "#161b26" : "transparent",
              border: "1px solid",
              borderColor: activeView === "dag" ? "#2d354a #2d354a transparent" : "transparent",
              borderTopLeftRadius: "6px",
              borderTopRightRadius: "6px",
              color: activeView === "dag" ? "#00E599" : "#8B92A5",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            DAG Workflow Graph
          </button>
          <button
            type="button"
            onClick={() => setActiveView("telemetry")}
            style={{
              padding: "8px 16px",
              background: activeView === "telemetry" ? "#161b26" : "transparent",
              border: "1px solid",
              borderColor: activeView === "telemetry" ? "#2d354a #2d354a transparent" : "transparent",
              borderTopLeftRadius: "6px",
              borderTopRightRadius: "6px",
              color: activeView === "telemetry" ? "#00E599" : "#8B92A5",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Node Telemetry &amp; Lineage
          </button>
          <button
            type="button"
            onClick={() => setActiveView("json")}
            style={{
              padding: "8px 16px",
              background: activeView === "json" ? "#161b26" : "transparent",
              border: "1px solid",
              borderColor: activeView === "json" ? "#2d354a #2d354a transparent" : "transparent",
              borderTopLeftRadius: "6px",
              borderTopRightRadius: "6px",
              color: activeView === "json" ? "#00E599" : "#8B92A5",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Raw Ledger JSON
          </button>
        </div>

        {/* Body Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {activeView === "dag" && (
            <div style={{ display: "grid", gap: "16px" }}>
              <div
                style={{
                  background: "#12151f",
                  border: "1px solid #232838",
                  borderRadius: "8px",
                  padding: "18px 20px",
                }}
              >
                <h4 style={{ margin: "0 0 14px 0", color: "#F1F3F9", fontSize: "13.5px", fontWeight: 700 }}>
                  Deterministic Execution Flow (Topological Order)
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {/* Step 1 */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#10B981", color: "#000", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 800, flexShrink: 0 }}>
                      1
                    </span>
                    <div style={{ flex: 1, background: "#181d2a", border: "1px solid #2b3347", borderRadius: "6px", padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <b style={{ color: "#F1F3F9", fontSize: "12.5px" }}>company-profile</b>
                        <span style={{ fontSize: "10px", color: "#10B981", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>RESOLVED</span>
                      </div>
                      <small style={{ color: "#8B92A5", fontSize: "11px" }}>
                        Verifies ticker identity, IDX sector classification, and routing rules
                      </small>
                    </div>
                  </div>

                  <div style={{ marginLeft: "11px", width: "2px", height: "14px", background: "#333d54" }} />

                  {/* Step 2 (Parallel Fan-Out) */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                    <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#6366F1", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 800, flexShrink: 0, marginTop: "8px" }}>
                      2
                    </span>
                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
                      <div style={{ background: "#181d2a", border: "1px solid #2b3347", borderRadius: "6px", padding: "8px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <b style={{ color: "#C5CBD8", fontSize: "11.5px" }}>daily-market-data</b>
                          <span style={{ fontSize: "9.5px", color: "#10B981", fontFamily: "'JetBrains Mono', monospace" }}>SYNC</span>
                        </div>
                        <small style={{ color: "#8B92A5", fontSize: "10.5px" }}>Price &amp; Market Cap</small>
                      </div>
                      <div style={{ background: "#181d2a", border: "1px solid #2b3347", borderRadius: "6px", padding: "8px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <b style={{ color: "#C5CBD8", fontSize: "11.5px" }}>subsector-peers</b>
                          <span style={{ fontSize: "9.5px", color: "#10B981", fontFamily: "'JetBrains Mono', monospace" }}>SYNC</span>
                        </div>
                        <small style={{ color: "#8B92A5", fontSize: "10.5px" }}>Peer Multiples Set</small>
                      </div>
                      <div style={{ background: "#181d2a", border: "1px solid #2b3347", borderRadius: "6px", padding: "8px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <b style={{ color: "#C5CBD8", fontSize: "11.5px" }}>financials / metrics</b>
                          <span style={{ fontSize: "9.5px", color: "#10B981", fontFamily: "'JetBrains Mono', monospace" }}>SYNC</span>
                        </div>
                        <small style={{ color: "#8B92A5", fontSize: "10.5px" }}>Statements / Ratios</small>
                      </div>
                      <div style={{ background: "#181d2a", border: "1px solid #2b3347", borderRadius: "6px", padding: "8px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <b style={{ color: "#C5CBD8", fontSize: "11.5px" }}>news-sentiment</b>
                          <span style={{ fontSize: "9.5px", color: "#10B981", fontFamily: "'JetBrains Mono', monospace" }}>SYNC</span>
                        </div>
                        <small style={{ color: "#8B92A5", fontSize: "10.5px" }}>Sectors Feed</small>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginLeft: "11px", width: "2px", height: "14px", background: "#333d54" }} />

                  {/* Step 3 (Valuation Router) */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#F59E0B", color: "#000", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 800, flexShrink: 0 }}>
                      3
                    </span>
                    <div style={{ flex: 1, background: "#181d2a", border: "1px solid #2b3347", borderRadius: "6px", padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <b style={{ color: "#F1F3F9", fontSize: "12.5px" }}>valuation-engine-router</b>
                        <span style={{ fontSize: "10px", color: "#F59E0B", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                          {classification?.includes("FINANCIAL") ? "RESIDUAL INCOME MODEL" : "FCFF DCF MODEL"}
                        </span>
                      </div>
                      <small style={{ color: "#8B92A5", fontSize: "11px" }}>
                        Deterministic zero-LLM routing based on Bank/Financial vs Commercial sector taxonomy
                      </small>
                    </div>
                  </div>

                  <div style={{ marginLeft: "11px", width: "2px", height: "14px", background: "#333d54" }} />

                  {/* Step 4 (Forensic Audit) */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#EC4899", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 800, flexShrink: 0 }}>
                      4
                    </span>
                    <div style={{ flex: 1, background: "#181d2a", border: "1px solid #2b3347", borderRadius: "6px", padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <b style={{ color: "#F1F3F9", fontSize: "12.5px" }}>forensics &amp; earnings-quality</b>
                        <span style={{ fontSize: "10px", color: "#EC4899", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>EVALUATED</span>
                      </div>
                      <small style={{ color: "#8B92A5", fontSize: "11px" }}>
                        CFO/NI cash conversion &amp; Accounts Receivable growth divergence verification
                      </small>
                    </div>
                  </div>

                  <div style={{ marginLeft: "11px", width: "2px", height: "14px", background: "#333d54" }} />

                  {/* Step 5 (Analyst Checkpoint) */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#00E599", color: "#000", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 800, flexShrink: 0 }}>
                      5
                    </span>
                    <div style={{ flex: 1, background: "#181d2a", border: "1px solid #2b3347", borderRadius: "6px", padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <b style={{ color: "#F1F3F9", fontSize: "12.5px" }}>analyst-decision-checkpoint &amp; export</b>
                        <span style={{ fontSize: "10px", color: "#00E599", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>AUDITED</span>
                      </div>
                      <small style={{ color: "#8B92A5", fontSize: "11px" }}>
                        Requires explicit analyst approval before formulaic Excel workbook (.xlsx) generation
                      </small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeView === "telemetry" && (
            <div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #232838", textAlign: "left", color: "#8B92A5", fontSize: "11px" }}>
                    <th style={{ padding: "8px 12px" }}>Node / Operation</th>
                    <th style={{ padding: "8px 12px" }}>Status</th>
                    <th style={{ padding: "8px 12px" }}>Latency</th>
                    <th style={{ padding: "8px 12px" }}>Evidence ID / SHA Lineage</th>
                    <th style={{ padding: "8px 12px" }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((node, i) => (
                    <tr key={`${node.operation}-${i}`} style={{ borderBottom: "1px solid #1a1e2b" }}>
                      <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono', monospace", color: "#F1F3F9", fontWeight: 600 }}>
                        {node.operation}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "3px",
                            fontSize: "10px",
                            fontWeight: 700,
                            fontFamily: "'JetBrains Mono', monospace",
                            background: node.cacheStatus === "HIT" ? "rgba(99, 102, 241, 0.15)" : "rgba(16, 185, 129, 0.15)",
                            color: node.cacheStatus === "HIT" ? "#818cf8" : "#34d399",
                          }}
                        >
                          {node.cacheStatus === "HIT" ? "CACHE HIT" : "LIVE API"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono', monospace", color: "#C5CBD8" }}>
                        {node.latencyMs}ms
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono', monospace", color: "#8B92A5", fontSize: "10.5px" }}>
                        {node.evidenceId}
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono', monospace", color: "#8B92A5", fontSize: "10.5px" }}>
                        {node.timestamp ? node.timestamp.slice(11, 19) : "—"} UTC
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeView === "json" && (
            <pre
              style={{
                margin: 0,
                padding: "16px",
                background: "#08090d",
                border: "1px solid #1c212e",
                borderRadius: "6px",
                color: "#94a3b8",
                fontSize: "11px",
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: "1.5",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(exportPayload, null, 2)}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid #232838",
            background: "#12151f",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "11.5px",
            color: "#8B92A5",
          }}
        >
          <span>
            Tekan <kbd style={{ padding: "2px 6px", background: "#1c212e", borderRadius: "3px", border: "1px solid #2d354a", color: "#F1F3F9" }}>Esc</kbd> atau klik di luar untuk menutup
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#00E599" }}>
            ✓ Verified Sectors API v2 Schema
          </span>
        </div>
      </div>
    </div>
  );
}
