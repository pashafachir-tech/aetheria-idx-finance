"use client";

import { EXPLAINERS, type ExplainerKey } from "../lib/explainers";

export function MetricExplainerTooltip({ metric, context }: Readonly<{ metric: ExplainerKey; context: string }>) {
  const explainer = EXPLAINERS[metric];
  return (
    <span className="metric-tip" tabIndex={0} aria-label={`Penjelasan ${explainer.label}`}>
      <span className="metric-tip-icon" aria-hidden>i</span>
      <span className="metric-tip-popover" role="tooltip">
        <b>{explainer.label}</b>
        <span className="metric-tip-row"><em>Definisi</em>{explainer.definition}</span>
        <span className="metric-tip-row"><em>Analogi</em>{explainer.analogy}</span>
        <span className="metric-tip-row"><em>Konteks emiten</em>{context}</span>
      </span>
    </span>
  );
}

export interface PassportData {
  provider: string;
  endpoint: string;
  period: string;
  tier: string;
  verification: string;
}

export function ProvenancePassport({ passport }: Readonly<{ passport: PassportData }>) {
  return (
    <span className="passport" tabIndex={0} aria-label="Provenance passport">
      <span className="passport-badge" aria-hidden>PP</span>
      <span className="passport-popover" role="tooltip">
        <b>Provenance Passport</b>
        <span><em>Provider</em>{passport.provider}</span>
        <span><em>Endpoint</em>{passport.endpoint}</span>
        <span><em>Report period</em>{passport.period}</span>
        <span><em>Lineage tier</em>{passport.tier}</span>
        <span><em>Verification</em>{passport.verification}</span>
      </span>
    </span>
  );
}