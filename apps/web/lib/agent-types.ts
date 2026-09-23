/**
 * Shared types for Autonomous Agent Orchestrator (Tab 5: AI Agent Dossier)
 * Cleanly separated to ensure zero client/server bundle leaks.
 */

export type AgentAnalystFocus = "360_institutional" | "forensic" | "smart_money" | "moat";

export interface ReActStep {
  stepIndex: number;
  nodeId: "fundamental_forensics" | "smart_money_flow" | "segment_moat" | "governance_audit" | "thesis_synthesis";
  nodeTitle: string;
  thought: string;
  action: {
    tool: string;
    input: Record<string, unknown>;
  };
  observation: {
    summary: string;
    dataSnippet: unknown;
    cacheStatus: "HIT" | "MISS";
    latencyMs: number;
  };
  critique: string;
  timestamp: string;
}

export interface SmartMoneyFlowArtifact {
  ticker: string;
  cumulativeNet10d: number;
  flowStance: "AGGRESSIVE ACCUMULATION" | "MODERATE ACCUMULATION" | "NEUTRAL" | "DISTRIBUTION";
  foreignDominancePct: number;
  dailyFlows: Array<{
    date: string;
    netForeign: number;
    foreignBuy: number;
    foreignSell: number;
  }>;
  topAccumulators: Array<{
    brokerCode: string;
    brokerName: string;
    netValue: number;
  }>;
  topDistributors: Array<{
    brokerCode: string;
    brokerName: string;
    netValue: number;
  }>;
}

export interface RevenueSegmentArtifact {
  ticker: string;
  year: number;
  segments: Array<{
    segment: string;
    revenue: number;
    percentage: number;
  }>;
  moatAssessment: {
    diversificationScore: number; // 0-100
    dominantSegmentRisk: "LOW" | "MODERATE" | "HIGH";
    corePricingPower: string;
  };
}

export interface InsiderWatchdogData {
  signal: "BULLISH_INSIDER_ACCUMULATION" | "NEUTRAL" | "BEARISH_INSIDER_SELLING";
  status: "VERIFIED" | "MONITORING";
  summary: string;
  filingDate: string;
}

export interface CorporateActionsSentinelData {
  status: "DIVIDEND_DECLARED" | "AGM_SCHEDULED" | "NORMAL";
  summary: string;
  upcomingDate: string;
}

export interface GovernanceGcgArtifact {
  ticker: string;
  controllingShareholders: Array<{ name: string; percentage: number }>;
  institutionalPct: number;
  retailPct: number;
  foreignPct: number;
  domesticPct: number;
  totalShareholders: number;
  gcgScore: number; // 0-100
  gcgRating: "PRIME_INSTITUTIONAL" | "STANDARD" | "WATCHLIST";
  insiderWatchdog?: InsiderWatchdogData;
  corporateActionsSentinel?: CorporateActionsSentinelData;
  recentFilings: Array<{
    title: string;
    date: string;
    category: string;
    url: string;
  }>;
  corporateActions: Array<{
    type: string;
    date?: string;
    amount?: number;
    description?: string;
  }>;
}

export interface ValuationConvergenceArtifact {
  ticker: string;
  currentPrice: number;
  modelIntrinsicValue: number;
  modelName: "FCFF_DCF" | "RESIDUAL_INCOME";
  impliedUpsidePct: number;
  consensusTargetPrice: number;
  marginOfSafetyPct: number;
  verdict: "SIGNIFICANTLY UNDERVALUED" | "FAIRLY VALUED" | "PREMIUM / OVERVALUED";
}

export interface KillCriterionItem {
  condition: string;
  metricTrigger: string;
  rationale: string;
}

export interface InstitutionalMemo {
  ticker: string;
  companyName: string;
  overallStance: "STRONGLY ACCUMULATE" | "TACTICAL HOLD" | "DEFENSIVE AVOID";
  convictionLevel: "HIGH" | "MEDIUM" | "SPECULATIVE";
  targetPrice: number;
  timeHorizon: string;
  catalysts: string[];
  bullCaseArguments: [string, string, string];
  bearCaseArguments: [string, string, string];
  killCriteriaChecklist: [KillCriterionItem, KillCriterionItem, KillCriterionItem];
  markdownReport: string;
}

export interface AgentInvestigationReport {
  ticker: string;
  companyName: string;
  sector: string;
  subsector: string;
  focus: AgentAnalystFocus;
  status: "COMPLETE" | "RUNNING" | "ERROR";
  executionTimeMs: number;
  dagNodesExecuted: number;
  steps: ReActStep[];
  artifacts: {
    smartMoneyFlow: SmartMoneyFlowArtifact;
    revenueSegments: RevenueSegmentArtifact;
    governanceMatrix: GovernanceGcgArtifact;
    valuationConvergence: ValuationConvergenceArtifact;
  };
  memo: InstitutionalMemo;
  generatedAt: string;
}
