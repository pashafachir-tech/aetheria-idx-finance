"use client";

import { useState } from "react";

interface EvidenceItem {
  id: string;
  provider: string;
  operation: string;
  retrievedAt: string;
  cacheStatus: "hit" | "miss";
  reportingPeriod?: string;
  sourceField?: string;
}

interface Snapshot {
  state: string;
  ticker?: string;
  failure?: string;
  plan?: { objective: string; steps: Array<{ id: string; description: string }> };
  collected?: { evidence: EvidenceItem[] };
  forensics?: {
    cfoToNi: { status: "flagged" | "clear" | "not_evaluable"; threshold: number; periods: Array<{ periodEnd: string; ratio: number }> };
    receivablesDivergence: { status: "flagged" | "clear" | "not_evaluable"; ratio?: number; revenueGrowth?: number; receivablesGrowth?: number; periodEnd?: string };
  };
  analystDecision?: { action: "apply" | "edit" | "dismiss"; finalHaircut: number; decidedAt: string; rationale?: string };
  valuation?: { fairValuePerShare: number; enterpriseValue: number; equityValue: number };
}

interface RunResponse {
  id: string;
  snapshot: Snapshot;
  presentation: {
    marketPrice: number | null;
    historicalRevenueGrowth: number | null;
    suggestedHaircut: number;
    reverseDcf: { impliedTerminalGrowth: number; impliedEnterpriseValue: number } | null;
    mode: "live" | "fixture";
  };
}

function formatIdr(value: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
}

const operationLabels: Record<string, string> = {
  getCompanyProfile: "Company profile",
  getFinancialStatements: "Annual financials",
  getDailyMarketData: "Market snapshot",
  getSubsectorPeers: "Subsector peers",
};

export default function Home() {
  const [run, setRun] = useState<RunResponse | null>(null);
  const [phase, setPhase] = useState<"idle" | "starting" | "awaiting" | "deciding" | "done" | "failed">("idle");
  const [showHaircut, setShowHaircut] = useState(false);
  const [sliderHaircut, setSliderHaircut] = useState(0.1);
  const [exportMessage, setExportMessage] = useState("");
  const [failure, setFailure] = useState<{ message: string; recovery: string } | null>(null);

  const snapshot = run?.snapshot ?? null;
  const stateLabel = snapshot?.state.replace(/_/g, " ") ?? "idle";

  async function startRun() {
    setPhase("starting");
    setExportMessage("");
    setFailure(null);
    setRun(null);
    const response = await fetch("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticker: "AKRA" }),
    });
    const body = await response.json();
    if (!response.ok) {
      setPhase("failed");
      setFailure({ message: body.message ?? "Research run failed.", recovery: body.recovery ?? "Retry the research run." });
      return;
    }
    const result = body as RunResponse;
    setRun(result);
    if (result.snapshot.state === "failed") {
      setPhase("failed");
      setFailure({ message: result.snapshot.failure ?? "Research run failed.", recovery: "Review the collected data and retry." });
      return;
    }
    if (result.snapshot.state === "awaiting_analyst") {
      setSliderHaircut(result.presentation.suggestedHaircut);
      setShowHaircut(true);
      setPhase("awaiting");
    } else {
      setPhase("done");
    }
  }

  async function decide(action: "apply" | "edit" | "dismiss") {
    if (!run) return;
    setPhase("deciding");
    const response = await fetch(`/api/research/${run.id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, finalHaircut: sliderHaircut, rationale: "Analyst checkpoint in the AKRA workflow." }),
    });
    const body = await response.json();
    setShowHaircut(false);
    if (!response.ok) {
      setPhase("failed");
      setFailure({ message: body.message ?? "Decision could not be recorded.", recovery: body.recovery ?? "Retry the analyst checkpoint." });
      return;
    }
    setRun({ ...body, id: run.id });
    setPhase("done");
  }

  async function exportWorkbook() {
    if (!run) return;
    setExportMessage("Generating formula workbook...");
    const response = await fetch(`/api/research/${run.id}/workbook`);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setExportMessage(body?.message ?? "Workbook export failed. Review the research state and try again.");
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `aetheria-${run.id}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    setExportMessage("Workbook downloaded with live Excel formulas.");
  }

  const cfo = snapshot?.forensics?.cfoToNi;
  const receivables = snapshot?.forensics?.receivablesDivergence;
  const valuation = snapshot?.valuation;
  const decision = snapshot?.analystDecision;
  const planSteps = snapshot?.plan?.steps;
  const canExport = snapshot?.state === "exporting" || snapshot?.state === "completed";

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">A</span><span>Aetheria <b>IDX Finance</b></span></div>
        <div className="header-note">Evidence-first research workflow <span>AKRA demo</span></div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">RESEARCH RUN / NON-FINANCIAL IDX</p>
          <h1>AKRA <span>PT AKR Corporindo Tbk</span></h1>
          <p className="hero-copy">A first-pass equity research workflow grounded in Sectors evidence and deterministic cash-flow analysis.</p>
        </div>
        <div className="run-state-wrap">
          {run && <span className="mode-tag">{run.presentation.mode === "live" ? "LIVE SECTORS" : "FIXTURE MODE"}</span>}
          <div className={`run-state ${snapshot?.state ?? ""}`}><span className="pulse" />{stateLabel}</div>
        </div>
      </section>

      <section className="action-row" aria-label="Research controls">
        <div className="ticker-field"><label htmlFor="ticker">IDX ticker</label><input id="ticker" value="AKRA" readOnly /></div>
        <button className="primary" onClick={startRun} disabled={phase === "starting" || phase === "deciding"}>{phase === "starting" ? "Planning and collecting..." : "Run research"}</button>
        {phase === "failed" && failure && <p className="run-error"><b>Research failed.</b> {failure.message} {failure.recovery}</p>}
      </section>

      <div className="workspace">
        <section className="main-column">
          <Panel title="Research plan" eyebrow="01 / PLANNING" status={planSteps ? "PLANNED" : "STANDBY"}>
            {planSteps ? <ol className="plan-list">
              {planSteps.map((step) => <li key={step.id}><b>{step.description}</b></li>)}
            </ol> : <div className="empty-state">The agent research plan appears once the server run starts.</div>}
          </Panel>

          <Panel title="Forensic signals" eyebrow="03 / DETERMINISTIC ENGINE" status={cfo ? "EVALUATED" : "PENDING"}>
            {cfo && receivables ? <div className="signal-grid">
              <Signal label="CFO / net income" value={signalCfoValue(cfo.status)} tone={cfo.status === "flagged" ? "warning" : "neutral"} note={cfo.status === "flagged" ? "Two consecutive periods below threshold." : cfo.status === "clear" ? "No consecutive below-threshold trigger." : "Not evaluable with available data."}>
                <div className="ratio-list">
                  {cfo.periods.slice().reverse().map((period) => <div className="ratio-row" key={period.periodEnd}><span>{period.periodEnd.slice(0, 4)}</span><strong>{period.ratio.toFixed(2)}x</strong></div>)}
                </div>
              </Signal>
              <Signal label="Receivables divergence" value={receivables.ratio != null ? `${receivables.ratio.toFixed(2)}x` : "n/a"} tone={receivables.status === "flagged" ? "warning" : "neutral"} note={receivables.status === "flagged" ? "Receivables outpaced revenue growth." : receivables.status === "clear" ? "No divergence trigger." : "Suppressed: not evaluable (input missing or growth near zero)."}>
                <div className="ratio-list">
                  <div className="ratio-row"><span>Revenue growth</span><strong>{receivables.revenueGrowth != null ? `${(receivables.revenueGrowth * 100).toFixed(1)}%` : "n/a"}</strong></div>
                  <div className="ratio-row"><span>Receivables growth</span><strong>{receivables.receivablesGrowth != null ? `${(receivables.receivablesGrowth * 100).toFixed(1)}%` : "n/a"}</strong></div>
                </div>
              </Signal>
            </div> : <div className="empty-state">Forensic evaluation runs after the server collects Sectors evidence.</div>}
            {cfo && <p className="research-note">Research signal only, not a fraud conclusion. Evidence: <code>{snapshot?.collected?.evidence.map((item) => item.id).join(", ")}</code></p>}
          </Panel>

          <Panel title="DCF output" eyebrow="05 / VALUATION" status={valuation ? "READY" : "WAITING"}>
            {valuation && decision ? <div className="valuation">
              <div><span>Fair value / share</span><strong>Rp {formatIdr(valuation.fairValuePerShare)}</strong><small>FCFF DCF, {Math.round(decision.finalHaircut * 100)}% analyst haircut</small></div>
              <div><span>Enterprise value</span><strong>Rp {formatIdr(valuation.enterpriseValue)}</strong><small>Deterministic projected FCFF and terminal value</small></div>
              <div><span>Equity value</span><strong>Rp {formatIdr(valuation.equityValue)}</strong><small>After cash, debt, and minority interest</small></div>
            </div> : <div className="empty-state">Complete the analyst checkpoint to calculate the deterministic DCF.</div>}
            {decision && <div className="decision-recap">Analyst decision: <b>{decision.action}</b> at <b>{Math.round(decision.finalHaircut * 100)}%</b> on {new Date(decision.decidedAt).toLocaleString()}{decision.rationale ? ` - ${decision.rationale}` : ""}</div>}
          </Panel>

          <Panel title="Reverse DCF" eyebrow="06 / MARKET CHECK" status={run?.presentation.reverseDcf ? "READY" : "WAITING"}>
            {run?.presentation.reverseDcf ? <div className="reverse-grid">
              <div><span>Market implied growth</span><strong>{(run.presentation.reverseDcf.impliedTerminalGrowth * 100).toFixed(2)}%</strong><small>Reverse DCF at last price {run.presentation.marketPrice ? `Rp ${formatIdr(run.presentation.marketPrice)}` : "n/a"}</small></div>
              <div><span>Historical revenue growth</span><strong>{run.presentation.historicalRevenueGrowth != null ? `${(run.presentation.historicalRevenueGrowth * 100).toFixed(1)}%` : "n/a"}</strong><small>Latest two annual reporting periods</small></div>
            </div> : decision ? <div className="empty-state">Reverse DCF is not solvable at the current market price with these assumptions.</div> : <div className="empty-state">Reverse DCF appears after the analyst decision is recorded.</div>}
          </Panel>
        </section>

        <aside className="side-column">
          <Panel title="Evidence trail" eyebrow="02 / SECTORS" status={snapshot?.collected ? "TRACE READY" : "STANDBY"}>
            {snapshot?.collected ? <div className="trace-list">
              {snapshot.collected.evidence.map((item) => <div className="trace" key={item.id}><div><b>{operationLabels[item.operation] ?? item.operation}</b><span>{item.reportingPeriod ?? "Current"}</span><code>{item.id}</code></div><em>{item.cacheStatus === "hit" ? "CACHE HIT" : "LIVE"}</em></div>)}
            </div> : <div className="empty-state">Evidence references appear once collection completes.</div>}
            <p className="cache-note">Every displayed number carries an evidence reference with operation, period, and cache status.</p>
          </Panel>
          <Panel title="Export" eyebrow="07 / WORKBOOK" status={canExport ? "AVAILABLE" : "LOCKED"}>
            <p className="export-copy">The workbook uses the recorded analyst decision for its live DCF formulas.</p>
            <button className="secondary" disabled={!canExport} onClick={exportWorkbook}>Export workbook</button>
            {exportMessage && <p className="export-message" role="status">{exportMessage}</p>}
          </Panel>
        </aside>
      </div>

      <p className="disclaimer">For research and educational use only. Not investment advice.</p>

      {showHaircut && snapshot && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="haircut-title">
        <p className="eyebrow">ANALYST CHECKPOINT</p><h2 id="haircut-title">Approve the cash haircut?</h2>
        <p>{receivables?.status === "flagged" ? "Receivables grew faster than revenue. The engine suggests reducing projected FCFF; the final decision remains yours." : "Forensic signals are clear. You may still apply a conservative haircut; the final decision remains yours."}</p>
        <p className="modal-suggestion">Suggested by the deterministic engine: {Math.round((run?.presentation.suggestedHaircut ?? 0.1) * 100)}%</p>
        <label className="range-label" htmlFor="haircut">Edited haircut <output>{Math.round(sliderHaircut * 100)}%</output></label>
        <input id="haircut" type="range" min="0" max="0.5" step="0.01" value={sliderHaircut} onChange={(event) => setSliderHaircut(Number(event.target.value))} />
        <div className="modal-actions">
          <button className="text-button" onClick={() => decide("dismiss")}>Dismiss</button>
          <button className="text-button" onClick={() => decide("edit")}>Apply edited %</button>
          <button className="primary" onClick={() => decide("apply")}>Apply suggested</button>
        </div>
      </section></div>}
    </main>
  );
}

function signalCfoValue(status: "flagged" | "clear" | "not_evaluable") {
  if (status === "flagged") return "below threshold";
  if (status === "clear") return "within threshold";
  return "n/a";
}

function Panel({ title, eyebrow, status, children }: Readonly<{ title: string; eyebrow: string; status: string; children: React.ReactNode }>) {
  return <section className="panel"><div className="panel-header"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><span className="panel-status">{status}</span></div>{children}</section>;
}

function Signal({ label, value, note, tone, children }: Readonly<{ label: string; value: string; note: string; tone: "neutral" | "warning"; children?: React.ReactNode }>) {
  return <article className={`signal ${tone}`}><span>{label}</span><strong>{value}</strong><p>{note}</p>{children}</article>;
}