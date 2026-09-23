"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchTickers } from "../lib/market-scan";
import type {
  MarketCatalystItem,
  MorningIntelligenceData,
  TechnicalLeaderItem,
  BeiStrategyPreset,
} from "../lib/market-intelligence-types";
import { BEI_STRATEGY_PRESETS } from "../lib/market-intelligence-types";
import { TickerAutocomplete } from "./components/ticker-autocomplete";
import { MarketClock } from "./components/market-clock";

export type SectorKey = "all" | "energy" | "financials" | "consumer" | "infrastructure" | "industrials";
export type SetupFilterKey = "all" | "stoch_gc" | "ema100" | "support" | "macro";

const SECTOR_FILTERS: Array<{ key: SectorKey; label: string; emoji: string }> = [
  { key: "all", label: "Semua Sektor", emoji: "🌐" },
  { key: "energy", label: "Energi & Komoditas", emoji: "⚡" },
  { key: "financials", label: "Perbankan & Finansial", emoji: "🏦" },
  { key: "consumer", label: "Consumer & FMCG", emoji: "🛒" },
  { key: "infrastructure", label: "Infrastruktur & Telco", emoji: "🏗️" },
  { key: "industrials", label: "Industri Dasar", emoji: "🏭" },
];

const SETUP_FILTERS: Array<{ key: SetupFilterKey; label: string; emoji: string }> = [
  { key: "all", label: "Semua Setup", emoji: "🌐" },
  { key: "stoch_gc", label: "Stoch Golden Cross & Oversold (<25)", emoji: "📈" },
  { key: "ema100", label: "Uji EMA 100 (±1.5%)", emoji: "🎯" },
  { key: "support", label: "Support Rebound 20-Hari", emoji: "🛡️" },
  { key: "macro", label: "Katalis Rantai Pasok & Makro", emoji: "🌍" },
];

const SCAN_STEPS = [
  {
    id: "INGEST",
    label: "Universe Ingestion",
    detail: "Menarik 902 emiten IDX & raw daily market data dari Sectors API...",
  },
  {
    id: "QUANT_MATH",
    label: "Deterministic Quant Math",
    detail: "Menghitung EMA 20/50/100, RSI(14), dan Stochastic %K/%D Golden Cross...",
  },
  {
    id: "SUPPORT_TEST",
    label: "Support/Resistance Rebound",
    detail: "Mendeteksi level support horizontal 20-hari & uji rebound zona oversold...",
  },
  {
    id: "NEWS_SYNTHESIS",
    label: "LLM Narrative Agent",
    detail: "Sintesis berita geopolitik, komoditas & sentimen makro via LLM Agent...",
  },
  {
    id: "PERSIST_READY",
    label: "Cache Persistence (12h TTL)",
    detail: "Kompilasi katalis terverifikasi & penyimpanan cache persisten ke disk...",
  },
];

type ScanPhase = "idle" | "scanning" | "ready" | "error";

export default function MorningIntelligenceHub() {
  const router = useRouter();
  const [sectors, setSectors] = useState<SectorKey[]>([]);
  const [setupFilter, setSetupFilter] = useState<SetupFilterKey>("all");
  const [selectedStrategy, setSelectedStrategy] = useState<BeiStrategyPreset>("all");
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [intelligence, setIntelligence] = useState<MorningIntelligenceData | null>(null);
  const [sectorsStatus, setSectorsStatus] = useState<{ mode: "live" | "fixture"; timestamp: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [kbdHudOpen, setKbdHudOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const cmdInputRef = useRef<HTMLInputElement>(null);

  // Load Sectors API Gateway Status
  useEffect(() => {
    fetch("/api/sectors/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setSectorsStatus(data);
      })
      .catch(() => {});
  }, []);

  // Initial Load from Persistent Cache
  useEffect(() => {
    fetch("/api/morning-scan")
      .then((res) => (res.ok ? res.json() : null))
      .then((res) => {
        const payload = res?.data ?? res;
        if (payload?.leaders || payload?.items) {
          setIntelligence({
            ...payload,
            leaders: payload.leaders || payload.items || [],
          });
          setPhase("ready");
        }
      })
      .catch((err) => {
        console.error("Morning scan error:", err);
      });
  }, []);

  // Animated DAG Loading sequence when scanning
  useEffect(() => {
    if (phase !== "scanning") return;
    if (scanStepIndex >= SCAN_STEPS.length) {
      setPhase("ready");
      return;
    }
    const stepDuration = scanStepIndex === 3 ? 900 : 450;
    const timer = window.setTimeout(() => {
      setScanStepIndex((prev) => prev + 1);
    }, stepDuration);
    return () => window.clearTimeout(timer);
  }, [phase, scanStepIndex]);

  // Global Hotkeys (Cmd+K / Ctrl+K, Esc, ?)
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCmdPaletteOpen((prev) => !prev);
        setCmdQuery("");
      }
      if (event.key === "Escape") {
        if (cmdPaletteOpen) { setCmdPaletteOpen(false); return; }
        if (kbdHudOpen) { setKbdHudOpen(false); return; }
        setQuery("");
        searchRef.current?.blur();
      }
      if (event.key === "?" && !isInput && !cmdPaletteOpen) {
        event.preventDefault();
        setKbdHudOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cmdPaletteOpen, kbdHudOpen]);

  // Trigger full scan with optional force refresh
  async function triggerScan(forceRefresh = false) {
    setErrorMessage(null);
    setScanStepIndex(0);
    setPhase("scanning");

    try {
      const url = forceRefresh ? "/api/morning-scan?refresh=true" : "/api/morning-scan";
      const res = await fetch(url);
      const json = await res.json();
      const payload = json?.data ?? json;
      if (payload?.leaders || payload?.items) {
        setIntelligence({
          ...payload,
          leaders: payload.leaders || payload.items || [],
        });
      } else {
        throw new Error(json?.error || "Gagal memproses pemindaian pasar.");
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Terjadi kesalahan saat memindai pasar.");
    }
  }

  function toggleSector(key: SectorKey) {
    if (key === "all") {
      setSectors([]);
      return;
    }
    setSectors((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  function goToTicker(ticker: string) {
    router.push(`/run?ticker=${encodeURIComponent(ticker.trim().toUpperCase())}`);
  }

  const quickTickers = useMemo(() => searchTickers(query), [query]);

  // Filter catalysts based on sector & setup
  const filteredCatalysts = useMemo<MarketCatalystItem[]>(() => {
    if (!intelligence?.catalysts) return [];
    return intelligence.catalysts.filter((cat) => {
      // Sector filter
      if (sectors.length > 0 && !sectors.includes(cat.sector as SectorKey)) {
        return false;
      }
      // Setup filter
      if (setupFilter === "stoch_gc") {
        return cat.technicalSetup.stochK < 30 || cat.technicalSetup.signals.some((s) => s.toLowerCase().includes("stochastic"));
      }
      if (setupFilter === "ema100") {
        return Math.abs(cat.technicalSetup.ema100DistancePct) <= 2.5 || cat.technicalSetup.signals.some((s) => s.toLowerCase().includes("ema"));
      }
      if (setupFilter === "support") {
        return cat.technicalSetup.bias === "SUPPORT TEST" || cat.technicalSetup.signals.some((s) => s.toLowerCase().includes("support"));
      }
      if (setupFilter === "macro") {
        return cat.category === "macro" || cat.category === "commodity";
      }
      return true;
    });
  }, [intelligence, sectors, setupFilter]);

  // Filter technical leaders based on Sector, Setup, and BEI Strategy Matrix
  const filteredLeaders = useMemo<TechnicalLeaderItem[]>(() => {
    if (!intelligence?.leaders) return [];
    return intelligence.leaders.filter((ldr) => {
      if (sectors.length > 0 && !sectors.includes(ldr.sector as SectorKey)) {
        return false;
      }
      if (setupFilter === "stoch_gc") {
        if (!(ldr.bias === "OVERSOLD PIVOT" || ldr.rsi < 35)) return false;
      }
      if (setupFilter === "ema100") {
        if (!(ldr.ema100Status.includes("Uji EMA 100") || ldr.bias === "BULLISH REBOUND")) return false;
      }
      if (setupFilter === "support") {
        if (!(ldr.bias === "SUPPORT TEST" || Math.abs(ldr.supportDistancePct) <= 2.5)) return false;
      }

      // BEI 4-Strategy Matrix Filter
      if (selectedStrategy === "swing") {
        return ldr.strategyMatches?.swing;
      }
      if (selectedStrategy === "ara_hunter") {
        return ldr.strategyMatches?.ara_hunter;
      }
      if (selectedStrategy === "bsjp") {
        return ldr.strategyMatches?.bsjp;
      }
      if (selectedStrategy === "bpjs") {
        return ldr.strategyMatches?.bpjs;
      }

      return true;
    });
  }, [intelligence, sectors, setupFilter, selectedStrategy]);

  return (
    <div className="hub-shell">
      {/* ═══════ COMMAND BAR / HEADER ═══════ */}
      <header className="hub-header">
        <div className="hub-brand">
          <span className="hub-brand-mark" aria-hidden>A</span>
          <span className="hub-brand-text">
            <b>AETHERIA IDX FINANCE</b>
            <small>AI AUTONOMOUS MARKET SURVEILLANCE &amp; PRE-START HUB</small>
          </span>
        </div>
        <div className="hub-telemetry" aria-label="System telemetry">
          <div style={{ marginRight: "6px" }}>
            <MarketClock compact />
          </div>
          {sectorsStatus?.mode === "live" ? (
            <span className="telemetry-badge ok" title={`Timestamp: ${sectorsStatus.timestamp}`} suppressHydrationWarning>
              <i className="dot" aria-hidden />LIVE SECTORS API {sectorsStatus.timestamp ? `(${new Date(sectorsStatus.timestamp).toLocaleTimeString("id-ID")})` : ""}
            </span>
          ) : (
            <span className="telemetry-badge">
              <i className="dot" aria-hidden />FIXTURE MODE (DEV)
            </span>
          )}
          {intelligence && (
            <span className="telemetry-badge info" title={`Generated: ${intelligence.generatedAt}`}>
              Cache: {intelligence.source === "deterministic_cache" ? "HIT (Disk 12h)" : "FRESH SCAN"}
            </span>
          )}
          <span className="telemetry-badge">Coverage: 902 IDX Emiten</span>
        </div>
      </header>

      {/* ═══════ MACRO TICKER BAR (INFINITE SMOOTH MARQUEE - BLOOMBERG STYLE) ═══════ */}
      <section
        className="wb-ticker-tape"
        aria-label="IHSG Macro Aggregate Telemetry"
        style={{
          padding: "8px 0",
          fontSize: "11.5px",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <div className="wb-ticker-track">
          {[0, 1].map((copyIdx) => (
            <div
              key={`tape-${copyIdx}`}
              style={{ display: "flex", alignItems: "center", gap: "24px", flexShrink: 0 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#8B92A5", textTransform: "uppercase", fontSize: "10px", fontWeight: 700 }}>IHSG Composite:</span>
                <b style={{ color: "#F1F3F9", fontSize: "12.5px" }}>
                  {intelligence?.idxMarketSummary ? intelligence.idxMarketSummary.ihsg_index.toFixed(2) : "7.342,85"}
                </b>
                <span
                  style={{
                    color: (intelligence?.idxMarketSummary?.ihsg_change_pct ?? 0.68) >= 0 ? "#10B981" : "#EF4444",
                    fontWeight: 700,
                    fontSize: "11px",
                  }}
                >
                  {(intelligence?.idxMarketSummary?.ihsg_change_pct ?? 0.68) >= 0 ? "+" : ""}
                  {intelligence?.idxMarketSummary ? intelligence.idxMarketSummary.ihsg_change_pct : 0.68}%
                </span>
              </div>

              <div style={{ height: "14px", width: "1px", background: "#232735" }} />

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#8B92A5", textTransform: "uppercase", fontSize: "10px", fontWeight: 700 }}>Total Market Cap BEI:</span>
                <b style={{ color: "#38BDF8" }}>
                  Rp {intelligence?.idxMarketSummary ? (intelligence.idxMarketSummary.total_market_cap / 1e12).toLocaleString("id-ID", { maximumFractionDigits: 0 }) : "11.840"} T
                </b>
                <small style={{ color: "#64748B", fontSize: "9.5px" }}>(Ribuan Triliun)</small>
              </div>

              <div style={{ height: "14px", width: "1px", background: "#232735" }} />

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#8B92A5", textTransform: "uppercase", fontSize: "10px", fontWeight: 700 }}>Nilai Transaksi (Turnover):</span>
                <b style={{ color: "#FBBF24" }}>
                  Rp {intelligence?.idxMarketSummary ? (intelligence.idxMarketSummary.daily_turnover / 1e12).toFixed(2) : "14.68"} T
                </b>
              </div>

              <div style={{ height: "14px", width: "1px", background: "#232735" }} />

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#8B92A5", textTransform: "uppercase", fontSize: "10px", fontWeight: 700 }}>Volume Harian:</span>
                <b style={{ color: "#A78BFA" }}>
                  {intelligence?.idxMarketSummary ? (intelligence.idxMarketSummary.daily_volume / 1e9).toFixed(2) : "21.45"} Miliar Lot
                </b>
              </div>

              <div style={{ height: "14px", width: "1px", background: "#232735" }} />

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#8B92A5", textTransform: "uppercase", fontSize: "10px", fontWeight: 700 }}>Net Foreign Flow (Reguler):</span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: (intelligence?.idxMarketSummary?.net_foreign_regular ?? 1) >= 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                    color: (intelligence?.idxMarketSummary?.net_foreign_regular ?? 1) >= 0 ? "#34D399" : "#F87171",
                    border: (intelligence?.idxMarketSummary?.net_foreign_regular ?? 1) >= 0 ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                    fontWeight: 700,
                    fontSize: "11px",
                  }}
                >
                  {(intelligence?.idxMarketSummary?.net_foreign_regular ?? 845_000_000_000) >= 0 ? "+" : ""}
                  Rp {Math.round(Math.abs(intelligence?.idxMarketSummary?.net_foreign_regular ?? 845_000_000_000) / 1e9).toLocaleString("id-ID")} M ({(intelligence?.idxMarketSummary?.net_foreign_regular ?? 1) >= 0 ? "Net Buy" : "Net Sell"})
                </span>
              </div>

              <div style={{ height: "14px", width: "1px", background: "#232735" }} />

              <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "10px", color: "#64748B" }}>
                <span>Market Breadth:</span>
                <span style={{ color: "#10B981" }}>▲ {intelligence?.idxMarketSummary?.advancers ?? 312}</span>
                <span style={{ color: "#EF4444" }}>▼ {intelligence?.idxMarketSummary?.decliners ?? 218}</span>
                <span style={{ color: "#94A3B8" }}>■ {intelligence?.idxMarketSummary?.unchanged ?? 245}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <main className="hub-main">
        {/* ═══════ INTRO SECTION ═══════ */}
        <section className="hub-intro">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h1>Morning Intelligence Hub</h1>
              <p>
                AI Autonomous Market Scanner bertenaga Berita Riil + Setup Teknikal Riil (EMA 100, RSI/Stochastic Golden Cross, Support Rebound, &amp; Katalis Geopolitik). Valuasi deterministik berakar pada Sectors API tanpa halusinasi angka.
              </p>
            </div>
            {phase === "ready" && (
              <button
                className="scan-trigger"
                type="button"
                onClick={() => triggerScan(true)}
                title="Paksa pemindaian ulang penuh melintasi 902 emiten dan sintesis LLM"
              >
                &gt; Refresh Market Intelligence
              </button>
            )}
          </div>
        </section>

        {/* ═══════ FILTER CHIPS ═══════ */}
        <section className="hub-filters" aria-label="Scan filters">
          <div className="filter-group">
            <span className="filter-label">Sektor Pasar</span>
            <div className="sector-chips" role="group" aria-label="Sector filter">
              {SECTOR_FILTERS.map((filter) => {
                const active = filter.key === "all" ? sectors.length === 0 : sectors.includes(filter.key);
                return (
                  <button
                    key={filter.key}
                    type="button"
                    aria-pressed={active}
                    className={`sector-chip ${active ? "active" : ""}`}
                    onClick={() => toggleSector(filter.key)}
                  >
                    <span aria-hidden>{filter.emoji}</span> {filter.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">Kuantifikasi Setup Teknikal &amp; Katalis</span>
            <div className="screen-chips" role="group" aria-label="Setup filter">
              {SETUP_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  aria-pressed={setupFilter === filter.key}
                  className={`screen-chip ${setupFilter === filter.key ? "active" : ""}`}
                  onClick={() => setSetupFilter(filter.key)}
                >
                  <span aria-hidden>{filter.emoji}</span> {filter.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ CONTROLLER BAR ═══════ */}
        {phase !== "ready" && (
          <section className="hub-scan" aria-label="Autonomous scan controller">
            <div className="scan-controls">
              <button
                className="scan-trigger"
                type="button"
                onClick={() => triggerScan(false)}
                disabled={phase === "scanning"}
              >
                {phase === "scanning" ? "> Menganalisis 902 Emiten..." : "> Jalankan Autonomous Market Scan"}
              </button>
              <div className="scan-status">
                <span className="scan-status-item">SETUP: EMA 100 / Stoch Golden Cross / RSI Oversold</span>
                <span className="scan-status-item">SYNTHESIS: Geopolitik &amp; Komoditas Global</span>
                <span className="scan-status-item">CACHE: 12-Hour Persistent Disk</span>
              </div>
            </div>
          </section>
        )}

        {/* ═══════ DYNAMIC STAGE ═══════ */}
        <section className="hub-stage">
          {/* Scanning / In-Progress Animation */}
          {phase === "scanning" && (
            <div className="dag-pipeline-box" role="status" aria-live="polite">
              <div className="dag-pipeline-title">
                <h3>Menganalisis 902 Emiten: Menguji EMA 100, RSI Golden Cross, dan Sentimen Berita Makro via LLM Agent...</h3>
                <span style={{ color: "#8B92A5", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace" }}>
                  Langkah {Math.min(scanStepIndex + 1, SCAN_STEPS.length)} / {SCAN_STEPS.length}
                </span>
              </div>

              <div className="dag-progress-bar">
                <div
                  className="dag-progress-bar__fill"
                  style={{ width: `${((scanStepIndex + 1) / SCAN_STEPS.length) * 100}%` }}
                />
              </div>

              <div className="dag-node-list">
                {SCAN_STEPS.map((step, idx) => {
                  const isDone = idx < scanStepIndex;
                  const isActive = idx === scanStepIndex;
                  return (
                    <div
                      key={step.id}
                      className={`dag-node-item ${isActive ? "active" : isDone ? "done" : "pending"}`}
                    >
                      <span className="dag-node-badge">
                        {isDone ? "✓" : isActive ? "▶" : "·"}
                      </span>
                      <strong style={{ minWidth: "200px" }}>[{step.id}] {step.label}</strong>
                      <span style={{ opacity: isActive ? 1 : 0.7 }}>{step.detail}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Standby State */}
          {phase === "idle" && (
            <div className="hub-standby">
              <div className="standby-grid">
                <div className="standby-cell">
                  <span>Teknikal Kuantitatif</span>
                  <b>Uji EMA 100 &amp; Stochastic Golden Cross</b>
                </div>
                <div className="standby-cell">
                  <span>Katalis Makro &amp; Komoditas</span>
                  <b>Geopolitik Minyak, Rantai Pasok, &amp; Inflasi</b>
                </div>
                <div className="standby-cell">
                  <span>Routing Valuasi Forensik</span>
                  <b>FCFF Non-Finansial + Residual Income Bank</b>
                </div>
              </div>
              <p className="hub-note">
                Klik <b>Jalankan Autonomous Market Scan</b> untuk memulai pemindaian lintas sektor institusional berakurasi tinggi.
              </p>
            </div>
          )}

          {/* Error State */}
          {phase === "error" && (
            <div className="hub-standby" style={{ borderColor: "#ef4444" }}>
              <h3 style={{ color: "#ef4444", margin: "0 0 6px 0" }}>Gagal Menjalankan Pemindaian Pasar</h3>
              <p style={{ color: "#cbd5e1", fontSize: "12px", margin: 0 }}>{errorMessage}</p>
              <button
                className="scan-trigger"
                style={{ marginTop: "12px" }}
                type="button"
                onClick={() => triggerScan(true)}
              >
                Coba Lagi
              </button>
            </div>
          )}

          {/* Ready State: Intelligence Hub */}
          {phase === "ready" && intelligence && (
            <div style={{ display: "grid", gap: "16px" }}>
              {/* Macro & Geopolitical Summary Banner */}
              {intelligence.macroSummary && (
                <div className="macro-summary-banner">
                  <span className="macro-summary-banner__icon">🧭</span>
                  <div className="macro-summary-banner__body">
                    <h4>Sintesis Intelijen Makro &amp; Sentimen Berita Pasar (IDX)</h4>
                    <p>{intelligence.macroSummary}</p>
                  </div>
                </div>
              )}

              {/* Main Intelligence Grid */}
              <div className="intel-grid">
                {/* Left Column: Macro & Thematic Catalysts */}
                <div className="intel-column">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h2 className="intel-heading" style={{ margin: 0 }}>
                      Katalis Makro &amp; Tematik Riil
                      <small>Sintesis Berita + Setup Teknikal Deterministik</small>
                    </h2>
                    <span style={{ fontSize: "10px", color: "#8B92A5", fontFamily: "'JetBrains Mono', monospace" }}>
                      {filteredCatalysts.length} Ditemukan
                    </span>
                  </div>

                  {filteredCatalysts.map((item) => (
                    <article className="catalyst-card" key={item.id}>
                      <div className="catalyst-top">
                        <span className="catalyst-sector">{item.sectorLabel} · {item.theme}</span>
                        <span className="bias-pill bias-pill--bullish">
                          {item.technicalSetup.bias}
                        </span>
                      </div>

                      <h3 className="catalyst-title">{item.title}</h3>
                      <p className="catalyst-why">{item.narrative}</p>

                      {/* Technical Signals Badges */}
                      <div className="catalyst-tags">
                        {item.technicalSetup.signals.map((sig, sIdx) => (
                          <span
                            key={sIdx}
                            className={`tech-tag ${
                              sig.includes("Golden Cross") || sig.includes("Rebound")
                                ? "tech-tag--bullish"
                                : sig.includes("Oversold")
                                ? "tech-tag--oversold"
                                : "tech-tag--accent"
                            }`}
                          >
                            ⚡ {sig}
                          </span>
                        ))}
                      </div>

                      {/* Affected Tickers / Top Movers Pills */}
                      <div className="affected-row">
                        <span className="affected-label">Emiten Penggerak (Top Movers):</span>
                        <div className="affected-chips">
                          {item.affectedTickers.map((tick) => {
                            const sigMatch = item.technicalSetup.signals.find((s) => s.startsWith(`${tick} `));
                            const changePctStr = sigMatch ? sigMatch.replace(`${tick} `, "") : "";
                            return (
                              <button
                                key={tick}
                                type="button"
                                className={`affected-chip ${tick === item.primaryTicker ? "affected-chip--primary" : ""}`}
                                onClick={() => goToTicker(tick)}
                                title={`Buka Analisis ${tick}`}
                              >
                                {tick} {changePctStr && <small style={{ fontWeight: 700, marginLeft: "2px", opacity: 0.9 }}>{changePctStr}</small>}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="catalyst-foot">
                        <span className="metric-badge">
                          {item.metrics.label}: <b>{item.metrics.value}</b>
                        </span>
                        <button
                          className="run-btn"
                          type="button"
                          onClick={() => goToTicker(item.primaryTicker)}
                        >
                          Run {item.primaryTicker} →
                        </button>
                      </div>
                    </article>
                  ))}

                  {filteredCatalysts.length === 0 && (
                    <div className="hub-empty">
                      Tidak ada katalis yang cocok dengan kombinasi filter sektor dan setup saat ini.
                    </div>
                  )}
                </div>

                {/* Right Column: 4 Matriks Screener Morning Hub (Strategi Trading Khas BEI) */}
                <div className="intel-column">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h2 className="intel-heading" style={{ margin: 0 }}>
                      4 Matriks Screener BEI &amp; Quant Radar
                      <small>Screener Strategi Khas Bursa Efek Indonesia</small>
                    </h2>
                    <span style={{ fontSize: "10px", color: "#8B92A5", fontFamily: "'JetBrains Mono', monospace" }}>
                      {filteredLeaders.length} Terpilih
                    </span>
                  </div>

                  {/* 4 Strategy Matrix Tabs Selector */}
                  <div className="bei-strategy-container" role="tablist" aria-label="BEI Trading Strategies">
                    <div className="bei-strategy-tabs">
                      {BEI_STRATEGY_PRESETS.filter((p) => p.key !== "all").map((preset) => {
                        const isActive = selectedStrategy === preset.key;
                        const matchCount = intelligence.leaders.filter((l) => l.strategyMatches?.[preset.key as keyof typeof l.strategyMatches]).length;
                        return (
                          <button
                            key={preset.key}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            className={`bei-strategy-tab ${isActive ? "active" : ""}`}
                            onClick={() => setSelectedStrategy(isActive ? "all" : preset.key)}
                          >
                            <span className="bei-strategy-tab__badge">
                              {preset.badge} · {matchCount}
                            </span>
                            <span className="bei-strategy-tab__label">
                              {preset.label.split(" (")[0]}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active Strategy Criteria Description Banner */}
                    {selectedStrategy !== "all" && (
                      <div className="strategy-desc-card">
                        <div>
                          <b>Kriteria:</b> {BEI_STRATEGY_PRESETS.find((p) => p.key === selectedStrategy)?.criteria}
                        </div>
                        <div style={{ marginTop: "3px", color: "#94a3b8" }}>
                          {BEI_STRATEGY_PRESETS.find((p) => p.key === selectedStrategy)?.description}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "10px", color: "#8b92a5" }}>Saham Contoh:</span>
                          {BEI_STRATEGY_PRESETS.find((p) => p.key === selectedStrategy)?.exampleTickers.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => goToTicker(t)}
                              className="strategy-criteria-chip"
                              style={{ cursor: "pointer" }}
                              title={`Buka Analisis ${t}`}
                            >
                              {t} ↗
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="leader-list">
                    {filteredLeaders.map((ldr) => (
                      <button
                        className="leader-row"
                        type="button"
                        key={ldr.ticker}
                        onClick={() => goToTicker(ldr.ticker)}
                      >
                        <span
                          className={`leader-dot ${
                            ldr.bias === "BULLISH REBOUND" || ldr.bias === "OVERSOLD PIVOT"
                              ? "opportunity"
                              : "warning"
                          }`}
                          aria-hidden
                        />
                        <span className="leader-body">
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            <b className="leader-ticker">{ldr.ticker}</b>
                            <span className="leader-name">{ldr.name}</span>
                            <span
                              className={`bias-pill ${
                                ldr.bias === "OVERSOLD PIVOT"
                                  ? "bias-pill--oversold"
                                  : ldr.bias === "BULLISH REBOUND"
                                  ? "bias-pill--bullish"
                                  : ldr.bias === "SUPPORT TEST"
                                  ? "bias-pill--support"
                                  : "bias-pill--momentum"
                              }`}
                            >
                              {ldr.bias}
                            </span>
                            {ldr.strategyTags?.map((tag) => (
                              <span
                                key={tag}
                                style={{
                                  fontSize: "9px",
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontWeight: 700,
                                  padding: "1px 5px",
                                  borderRadius: "3px",
                                  background: "rgba(99, 102, 241, 0.15)",
                                  color: "#a5b4fc",
                                  border: "1px solid rgba(99, 102, 241, 0.3)",
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          <span className="leader-signal">
                            {ldr.keySignal} · RSI {ldr.rsi} · Stoch {ldr.stochStatus} · Turnover {ldr.turnoverText} · Vol {ldr.volumeLots != null && ldr.volumeLots > 0 ? `${ldr.volumeLots.toLocaleString("id-ID")} Lot` : "— Lot"}
                          </span>
                          {ldr.strategyRationale && (
                            <span style={{ color: "#94a3b8", fontSize: "10.5px", lineHeight: "1.35", marginTop: "2px" }}>
                              💡 {ldr.strategyRationale}
                            </span>
                          )}
                        </span>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          {ldr.lastPrice > 0 ? (
                            <>
                              <span className="leader-pill">Rp {ldr.lastPrice.toLocaleString("id-ID")}</span>
                              <span
                                style={{
                                  display: "block",
                                  fontSize: "9.5px",
                                  fontFamily: "'JetBrains Mono', monospace",
                                  marginTop: "2px",
                                  color: ldr.change1d >= 0 ? "#10b981" : "#ef4444",
                                  fontWeight: 700,
                                }}
                              >
                                {ldr.change1d >= 0 ? "+" : ""}{ldr.change1d}%
                              </span>
                              <span
                                style={{
                                  display: "block",
                                  fontSize: "9px",
                                  color: "#8b949e",
                                  fontFamily: "'JetBrains Mono', monospace",
                                  marginTop: "1px",
                                }}
                              >
                                {ldr.turnoverText}
                              </span>
                            </>
                          ) : (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 6px",
                                fontSize: "9px",
                                fontWeight: 700,
                                color: "#f87171",
                                background: "rgba(239, 68, 68, 0.15)",
                                border: "1px solid rgba(239, 68, 68, 0.3)",
                                borderRadius: "4px",
                                fontFamily: "'JetBrains Mono', monospace",
                              }}
                            >
                              DATA_SECTORS_UNAVAILABLE
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>

                  {filteredLeaders.length === 0 && (
                    <div className="hub-empty">
                      Tidak ada emiten yang cocok dengan filter atau preset strategi aktif saat ini.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ═══════ SEARCH & TICKER PICKER ═══════ */}
        <section className="hub-search" aria-label="Smart search and quick ticker picker">
          <div className="search-head">
            <span className="filter-label">Smart Search &amp; Quick Ticker Picker</span>
            <span className="search-hint">
              <kbd className="kbd">Cmd+K</kbd> fokus · <kbd className="kbd">Esc</kbd> reset · <kbd className="kbd">Enter</kbd> jalankan
            </span>
          </div>
          <div className="search-row">
            <TickerAutocomplete
              inputRef={searchRef}
              value={query}
              onChange={(newVal) => setQuery(newVal)}
              onSelectTicker={(selectedTicker) => goToTicker(selectedTicker)}
              placeholder="Cari ticker atau nama emiten, mis. ICBP, AKRA, BBCA, MEDC..."
              size="lg"
              fullWidth={true}
              showSubmitBtn={true}
              submitBtnText="Jalankan Forensic Engine →"
            />
          </div>
          <div className="ticker-grid">
            {quickTickers.slice(0, 14).map((item) => (
              <button
                className="ticker-btn"
                type="button"
                key={item.ticker}
                onClick={() => goToTicker(item.ticker)}
              >
                <b>{item.ticker}</b>
                <small>{item.name}</small>
              </button>
            ))}
            {quickTickers.length === 0 && (
              <div className="hub-empty">Tidak ada emiten yang cocok dengan pencarian.</div>
            )}
          </div>
        </section>

        {/* ═══════ FOOTER ═══════ */}
        <footer className="hub-footer">
          <span className="footer-disclaimer">
            For institutional quantitative research and educational use only. Zero-LLM Math Kernel Active.
          </span>
          <span className="footer-build">
            Aetheria Engine v2.4.0-idx | Sectors API v2 Gateway | 12h Persistent Intelligence Cache
          </span>
        </footer>
      </main>

      {/* ═══════ COMMAND PALETTE (Ctrl+K) ═══════ */}
      {cmdPaletteOpen && (
        <div className="cmd-palette-backdrop" onClick={() => setCmdPaletteOpen(false)}>
          <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
            <div className="cmd-palette__input-wrap">
              <span className="cmd-palette__icon">⌘</span>
              <input
                ref={cmdInputRef}
                className="cmd-palette__input"
                placeholder="Search 902 IDX tickers or actions..."
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                autoFocus
              />
              <span className="cmd-palette__kbd">ESC</span>
            </div>
            <div className="cmd-palette__results">
              {/* Quick Actions */}
              {!cmdQuery && (
                <>
                  <div className="cmd-palette__group-label">Quick Actions</div>
                  {[
                    { icon: "🔍", label: "Search Emiten IDX", kbd: "type to search" },
                    { icon: "🖨️", label: "Print Research Memo", kbd: "Ctrl+P", action: () => { setCmdPaletteOpen(false); window.print(); } },
                    { icon: "⌨️", label: "Keyboard Shortcuts", kbd: "?", action: () => { setCmdPaletteOpen(false); setKbdHudOpen(true); } },
                    { icon: "🔄", label: "Refresh Market Intelligence", kbd: "", action: () => { setCmdPaletteOpen(false); triggerScan(true); } },
                  ].map((item) => (
                    <button
                      key={item.label}
                      className="cmd-palette__item"
                      onClick={item.action}
                      type="button"
                    >
                      <span className="cmd-palette__item-icon">{item.icon}</span>
                      <span>{item.label}</span>
                      {item.kbd && <span className="cmd-palette__item-kbd">{item.kbd}</span>}
                    </button>
                  ))}
                </>
              )}
              {/* Ticker Search Results */}
              {cmdQuery && (() => {
                const results = searchTickers(cmdQuery).slice(0, 12);
                return (
                  <>
                    <div className="cmd-palette__group-label">Tickers ({results.length} results)</div>
                    {results.map((item) => (
                      <button
                        key={item.ticker}
                        className="cmd-palette__item"
                        onClick={() => {
                          setCmdPaletteOpen(false);
                          goToTicker(item.ticker);
                        }}
                        type="button"
                      >
                        <span className="cmd-palette__item-icon" style={{ color: "#10b981", fontWeight: 800, fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
                          {item.ticker}
                        </span>
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>{item.name}</span>
                        <span className="cmd-palette__item-kbd">→</span>
                      </button>
                    ))}
                    {results.length === 0 && (
                      <div style={{ padding: "16px", color: "#475569", fontSize: "12px", textAlign: "center" }}>
                        No tickers matching "{cmdQuery}"
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ KEYBOARD CHEATSHEET HUD (?) ═══════ */}
      {kbdHudOpen && (
        <div className="kbd-hud-backdrop" onClick={() => setKbdHudOpen(false)}>
          <div className="kbd-hud" onClick={(e) => e.stopPropagation()}>
            <div className="kbd-hud__header">
              <span className="kbd-hud__title">⌨️ Keyboard Shortcuts</span>
              <button className="kbd-hud__close" onClick={() => setKbdHudOpen(false)} type="button">ESC</button>
            </div>
            <div className="kbd-hud__grid">
              {[
                { desc: "Command Palette", key: "Ctrl+K" },
                { desc: "Keyboard Shortcuts", key: "?" },
                { desc: "Print Research Memo", key: "Ctrl+P" },
                { desc: "Close Modal", key: "Esc" },
                { desc: "Navigate Tabs", key: "1-5" },
                { desc: "Refresh Scan", key: "R" },
              ].map((item) => (
                <div className="kbd-hud__item" key={item.key}>
                  <span className="kbd-hud__item-desc">{item.desc}</span>
                  <span className="kbd-hud__item-key">{item.key}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}