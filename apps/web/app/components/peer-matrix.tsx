"use client";

import React, { useMemo } from "react";

export interface ActiveMetrics {
  marketCap: number;
  pe: number | null;
  pbv: number | null;
  roe: number | null;
  margin: number | null;
  isFinancial: boolean;
}

export interface PeerItem {
  symbol: string;
  companyName: string;
  marketCap: number;
  pe?: number | null;
  pbv?: number | null;
  roe?: number | null;
  margin?: number | null;
}

export interface PeerMatrixProps {
  activeTicker: string;
  activeCompanyName: string;
  activeMetrics: ActiveMetrics;
  peerList: PeerItem[];
  subsector?: string;
  onSelectPeer: (ticker: string) => void;
}



function fmtNum(val: number | null | undefined, decimals = 1, suffix = ""): string {
  if (val == null || !Number.isFinite(val)) return "—";
  return `${val.toFixed(decimals)}${suffix}`;
}

function fmtPct(val: number | null | undefined, decimals = 1): string {
  if (val == null || !Number.isFinite(val)) return "—";
  return `${(val * 100).toFixed(decimals)}%`;
}

function fmtTrillion(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val) || val <= 0) return "—";
  return `Rp ${(val / 1e12).toFixed(1)} T`;
}

function renderEarningsMetric(
  val: number | null | undefined,
  type: "pe" | "roe"
): React.ReactNode {
  // Emiten dengan net income negatif atau nilai null/kosong/non-positif (misal FOLK)
  const isDeficitOrNull =
    val == null ||
    !Number.isFinite(val) ||
    val <= 0;

  if (isDeficitOrNull) {
    return (
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
    );
  }

  if (type === "pe") {
    return `${val.toFixed(1)}x`;
  } else {
    return `${(val * 100).toFixed(1)}%`;
  }
}

export function PeerMatrix({
  activeTicker,
  activeCompanyName,
  activeMetrics,
  peerList,
  subsector,
  onSelectPeer,
}: PeerMatrixProps) {
  const cleanActive = activeTicker.toUpperCase();

  // Filter peers to exclude active ticker and pick top 3
  const validPeers = useMemo(() => {
    const list = (peerList || []).filter(
      (p) => p && p.symbol && p.symbol.toUpperCase() !== cleanActive
    );
    return list.slice(0, 3);
  }, [peerList, cleanActive]);

  // Compute peer median P/E for relative valuation
  const peerMedianPe = useMemo(() => {
    const peValues = validPeers
      .map((p) => p.pe)
      .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);

    if (peValues.length === 0) return null;
    peValues.sort((a, b) => a - b);
    const mid = Math.floor(peValues.length / 2);
    return peValues.length % 2 !== 0 ? peValues[mid] : (peValues[mid - 1] + peValues[mid]) / 2;
  }, [validPeers]);

  // Relative signal
  const relativeSignal = useMemo(() => {
    if (!activeMetrics.pe || !peerMedianPe || activeMetrics.pe <= 0) {
      return { label: "IN-LINE", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.15)" };
    }
    const ratio = activeMetrics.pe / peerMedianPe;
    if (ratio < 0.88) {
      return { label: "UNDERVALUED (DISCOUNT)", color: "#10B981", bg: "rgba(16, 185, 129, 0.15)" };
    }
    if (ratio > 1.15) {
      return { label: "PREMIUM MULTIPLE", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.15)" };
    }
    return { label: "FAIR VALUE", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.15)" };
  }, [activeMetrics.pe, peerMedianPe]);

  if (validPeers.length === 0) {
    return null; // Gracefully render nothing if no peers
  }

  return (
    <section
      className="wb-panel"
      style={{
        marginTop: "16px",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        overflowX: "auto",
      }}
    >
      <div
        className="wb-panel__header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flexWrap: "wrap" }}>
          <h2 className="wb-panel__title" style={{ whiteSpace: "nowrap" }}>Quick Peer Comparison Matrix</h2>
          <span className="wb-panel__badge wb-panel__badge--accent" style={{ whiteSpace: "nowrap" }}>
            {subsector || "Subsector Peers"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <span
            style={{
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              padding: "4px 9px",
              borderRadius: "4px",
              color: relativeSignal.color,
              background: relativeSignal.bg,
              border: `1px solid ${relativeSignal.color}40`,
              whiteSpace: "nowrap",
            }}
          >
            Target Signal: {relativeSignal.label}
          </span>
        </div>
      </div>

      <div style={{ width: "100%", overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            fontSize: "12.5px",
            textAlign: "left",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: "12px 14px",
                  background: "#12151f",
                  color: "#8B92A5",
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  borderBottom: "2px solid #232838",
                  width: "22%",
                }}
              >
                Metric / Metric
              </th>

              {/* Active Ticker Column Header */}
              <th
                style={{
                  padding: "12px 14px",
                  background: "rgba(0, 229, 153, 0.08)",
                  borderBottom: "2px solid #00E599",
                  borderLeft: "2px solid rgba(0, 229, 153, 0.3)",
                  borderRight: "2px solid rgba(0, 229, 153, 0.3)",
                  width: "26%",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: "9px",
                        fontWeight: 800,
                        background: "#00E599",
                        color: "#000",
                        padding: "1px 5px",
                        borderRadius: "3px",
                        marginBottom: "2px",
                      }}
                    >
                      TARGET EMITEN
                    </span>
                    <div style={{ color: "#F1F3F9", fontSize: "14px", fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                      {cleanActive}
                    </div>
                    <small style={{ color: "#8B92A5", fontSize: "10.5px", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>
                      {activeCompanyName}
                    </small>
                  </div>
                  <span style={{ fontSize: "16px" }}>🎯</span>
                </div>
              </th>

              {/* Peers Headers */}
              {validPeers.map((peer) => {
                const sym = peer.symbol.toUpperCase();
                return (
                  <th
                    key={sym}
                    style={{
                      padding: "12px 14px",
                      background: "#12151f",
                      borderBottom: "2px solid #232838",
                      width: "26%",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ color: "#C5CBD8", fontSize: "13.5px", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                          {sym}
                        </div>
                        <small style={{ color: "#8B92A5", fontSize: "10.5px", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "150px" }}>
                          {peer.companyName || `${sym} Tbk`}
                        </small>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectPeer(sym)}
                        style={{
                          background: "#1c2230",
                          border: "1px solid #333d54",
                          color: "#38bdf8",
                          borderRadius: "4px",
                          padding: "3px 7px",
                          fontSize: "10px",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "'JetBrains Mono', monospace",
                          transition: "all 0.15s ease",
                        }}
                        title={`Buka analisis riset ${sym}`}
                      >
                        Buka ➔
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Row 1: Market Cap */}
            <tr style={{ borderBottom: "1px solid #1a1e2b" }}>
              <td style={{ padding: "10px 14px", color: "#8B92A5", fontWeight: 600 }}>Market Cap</td>
              <td style={{ padding: "10px 14px", background: "rgba(0, 229, 153, 0.04)", borderLeft: "2px solid rgba(0, 229, 153, 0.2)", borderRight: "2px solid rgba(0, 229, 153, 0.2)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#00E599" }}>
                {fmtTrillion(activeMetrics.marketCap)}
              </td>
              {validPeers.map((peer) => (
                <td key={peer.symbol} style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono', monospace", color: "#C5CBD8" }}>
                  {fmtTrillion(peer.marketCap)}
                </td>
              ))}
            </tr>

            {/* Row 2: P/E Ratio */}
            <tr style={{ borderBottom: "1px solid #1a1e2b" }}>
              <td style={{ padding: "10px 14px", color: "#8B92A5", fontWeight: 600 }}>P/E Multiple</td>
              <td style={{ padding: "10px 14px", background: "rgba(0, 229, 153, 0.04)", borderLeft: "2px solid rgba(0, 229, 153, 0.2)", borderRight: "2px solid rgba(0, 229, 153, 0.2)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#F1F3F9" }}>
                {renderEarningsMetric(activeMetrics.pe, "pe")}
              </td>
              {validPeers.map((peer) => (
                <td key={peer.symbol} style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono', monospace", color: "#C5CBD8" }}>
                  {renderEarningsMetric(peer.pe, "pe")}
                </td>
              ))}
            </tr>

            {/* Row 3: P/BV Ratio */}
            <tr style={{ borderBottom: "1px solid #1a1e2b" }}>
              <td style={{ padding: "10px 14px", color: "#8B92A5", fontWeight: 600 }}>P/BV Multiple</td>
              <td style={{ padding: "10px 14px", background: "rgba(0, 229, 153, 0.04)", borderLeft: "2px solid rgba(0, 229, 153, 0.2)", borderRight: "2px solid rgba(0, 229, 153, 0.2)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#F1F3F9" }}>
                {fmtNum(activeMetrics.pbv, 2, "x")}
              </td>
              {validPeers.map((peer) => (
                <td key={peer.symbol} style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono', monospace", color: "#C5CBD8" }}>
                  {fmtNum(peer.pbv, 2, "x")}
                </td>
              ))}
            </tr>

            {/* Row 4: ROE */}
            <tr style={{ borderBottom: "1px solid #1a1e2b" }}>
              <td style={{ padding: "10px 14px", color: "#8B92A5", fontWeight: 600 }}>Return on Equity (ROE)</td>
              <td style={{ padding: "10px 14px", background: "rgba(0, 229, 153, 0.04)", borderLeft: "2px solid rgba(0, 229, 153, 0.2)", borderRight: "2px solid rgba(0, 229, 153, 0.2)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#10B981" }}>
                {renderEarningsMetric(activeMetrics.roe, "roe")}
              </td>
              {validPeers.map((peer) => (
                <td key={peer.symbol} style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono', monospace", color: "#C5CBD8" }}>
                  {renderEarningsMetric(peer.roe, "roe")}
                </td>
              ))}
            </tr>

            {/* Row 5: Margin / NIM */}
            <tr style={{ borderBottom: "1px solid #1a1e2b" }}>
              <td style={{ padding: "10px 14px", color: "#8B92A5", fontWeight: 600 }}>
                {activeMetrics.isFinancial ? "Net Interest Margin (NIM)" : "Operating Margin"}
              </td>
              <td style={{ padding: "10px 14px", background: "rgba(0, 229, 153, 0.04)", borderLeft: "2px solid rgba(0, 229, 153, 0.2)", borderRight: "2px solid rgba(0, 229, 153, 0.2)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#F1F3F9" }}>
                {fmtPct(activeMetrics.margin, 1)}
              </td>
              {validPeers.map((peer) => (
                <td key={peer.symbol} style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono', monospace", color: "#C5CBD8" }}>
                  {fmtPct(peer.margin, 1)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: "12px",
          paddingTop: "8px",
          borderTop: "1px solid #1a1e2b",
          fontSize: "11px",
          color: "#8B92A5",
          fontStyle: "italic",
        }}
      >
        * Emiten dengan status N/A mencatatkan laba bersih negatif atau belum memenuhi siklus pelaporan LTM penuh.
      </div>
    </section>
  );
}
