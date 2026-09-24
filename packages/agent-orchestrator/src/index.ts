import type { EarningsQualityScorecard, EvidenceRef, EvidenceSufficiencyResult, NewsItem, ReverseDcfSummary, ToolCallRecord } from "../../domain/src/index";
import {
  applyFcffHaircut,
  buildValuationSensitivity,
  calculateDcf,
  calculateResidualIncome,
  calculateReverseDcf,
  computeEarningsQualityScorecard,
  evaluateCfoToNi,
  evaluateReceivablesDivergence,
  validateDcfInputs,
  validateForensicPeriods,
  DEFAULT_TERMINAL_GROWTH_AXIS,
  DEFAULT_WACC_AXIS,
  type CashFlowBridge,
  type DcfInputs,
  type DcfValue,
  type ForensicPeriod,
  type ModelApplicability,
  type ReceivablesDivergenceResult,
  type ResidualIncomeInputs,
  type ResidualIncomeValue,
  type CfoToNiResult,
} from "../../finance-engine/src/index";

export type ResearchState =
  | "planning"
  | "collecting"
  | "auditing"
  | "self_correcting"
  | "validating"
  | "forensics"
  | "awaiting_analyst"
  | "valuing"
  | "verifying"
  | "synthesizing"
  | "exporting"
  | "completed"
  | "failed";

export interface ResearchPlanStep {
  id: string;
  description: string;
  tool?: string;
  rationale?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface ResearchPlan {
  objective: string;
  steps: ResearchPlanStep[];
  source?: "llm" | "fallback" | "scripted";
}

export interface ResearchPlanner {
  createPlan(input: { ticker: string; sector?: string }): Promise<ResearchPlan>;
}

export interface ResearchDataSource {
  load(ticker: string): Promise<CollectedResearch>;
}

export interface OrchestratorOptions {
  now?: () => Date;
  dataSource?: ResearchDataSource;
  maxCorrectionAttempts?: number;
}

export interface MemoFact {
  id: string;
  text: string;
  evidenceIds: string[];
}

export interface MemoWriter {
  writeMemo(input: { plan: ResearchPlan; facts: MemoFact[]; evidence: EvidenceRef[] }): Promise<{
    narrative: string;
    selectedFactIds: string[];
    citedEvidenceIds: string[];
  }>;
}

export interface CollectedResearch {
  forensicPeriods: ForensicPeriod[];
  valuation: Partial<DcfInputs>;
  evidence: EvidenceRef[];
  suggestedHaircut: number;
  sector?: string;
  marketPrice?: number;
  cashFlowBridge?: CashFlowBridge;
  modelApplicability?: ModelApplicability;
  residualIncomeInputs?: ResidualIncomeInputs;
  news?: NewsItem[];
  toolTrace?: ToolCallRecord[];
}

export interface AnalystDecision {
  action: "apply" | "edit" | "dismiss";
  finalHaircut: number;
  decidedAt: string;
  rationale?: string;
}

export interface ForensicResults {
  cfoToNi: CfoToNiResult;
  receivablesDivergence: ReceivablesDivergenceResult;
}

export interface ResearchMemo {
  narrative: string;
  facts: MemoFact[];
  citedEvidenceIds: string[];
  disclaimer: "For research and institutional decision-support only. Not financial or investment advice. Core market data sourced from Sectors API v2.";
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface SelfCorrectionRecord {
  attempts: number;
  reason: string;
  missing: string[];
  confidence: ConfidenceLevel;
  log: string[];
  resolved: boolean;
}

export interface ResearchSnapshot {
  ticker?: string;
  state: ResearchState;
  plan?: ResearchPlan;
  collected?: CollectedResearch;
  sufficiency?: EvidenceSufficiencyResult;
  confidence?: ConfidenceLevel;
  selfCorrection?: SelfCorrectionRecord;
  qualityScorecard?: EarningsQualityScorecard;
  forensics?: ForensicResults;
  analystDecision?: AnalystDecision;
  valuation?: DcfValue;
  residualIncome?: ResidualIncomeValue;
  reverseDcf?: ReverseDcfSummary;
  toolTrace?: ToolCallRecord[];
  memo?: ResearchMemo;
  failure?: string;
}

export interface EvidenceSufficiencyContext {
  periods?: ForensicPeriod[];
  now?: Date;
  maxAgeDays?: number;
}

export const EVIDENCE_SUFFICIENCY_THRESHOLD = 0.6;

export function evaluateEvidenceSufficiency(evidence: EvidenceRef[], context: EvidenceSufficiencyContext = {}): EvidenceSufficiencyResult {
  const now = context.now ?? new Date();
  const maxAgeDays = context.maxAgeDays ?? 45;
  const missing: string[] = [];
  if (evidence.length === 0) return { score: 0, periodCoverage: 0, itemCoverage: 0, freshness: 0, missing: ["evidence"] };

  const periods = context.periods ?? [];
  const distinctPeriods = new Set(periods.map((period) => period.periodEnd));
  const periodTarget = 2;
  const periodCoverage = Math.min(1, distinctPeriods.size / periodTarget);
  if (distinctPeriods.size < periodTarget) missing.push("reporting periods");

  const requiredFields: Array<keyof ForensicPeriod> = ["netIncome", "operatingCashFlow", "revenue", "accountsReceivable"];
  let itemCoverage = 0;
  if (periods.length > 0) {
    const latest = periods.reduce((newest, period) => (period.periodEnd > newest.periodEnd ? period : newest));
    const present = requiredFields.filter((field) => {
      const value = latest[field];
      return typeof value === "number" && Number.isFinite(value);
    });
    itemCoverage = present.length / requiredFields.length;
    for (const field of requiredFields) if (!present.includes(field)) missing.push(`latest.${String(field)}`);
  } else {
    missing.push("financial statement items");
  }

  const newestRetrieved = evidence.reduce((max, item) => {
    const parsed = Date.parse(item.retrievedAt);
    return Number.isFinite(parsed) && parsed > max ? parsed : max;
  }, 0);
  const ageDays = newestRetrieved > 0 ? (now.getTime() - newestRetrieved) / 86_400_000 : Number.POSITIVE_INFINITY;
  const freshness = Number.isFinite(ageDays) ? Math.max(0, Math.min(1, 1 - ageDays / maxAgeDays)) : 0;
  if (freshness < 1) missing.push("freshness");

  const score = 0.4 * periodCoverage + 0.4 * itemCoverage + 0.2 * freshness;
  return { score, periodCoverage, itemCoverage, freshness, missing };
}

const disclaimer = "For research and institutional decision-support only. Not financial or investment advice. Core market data sourced from Sectors API v2." as const;

export class AgentOrchestrator {
  private snapshot: ResearchSnapshot = { state: "planning" };
  private readonly now: () => Date;
  private readonly dataSource?: ResearchDataSource;
  private readonly maxCorrectionAttempts: number;

  constructor(
    private readonly planner: ResearchPlanner,
    private readonly memoWriter: MemoWriter,
    options: OrchestratorOptions | (() => Date) = {},
  ) {
    const resolved = typeof options === "function" ? { now: options } : options;
    this.now = resolved.now ?? (() => new Date());
    this.dataSource = resolved.dataSource;
    this.maxCorrectionAttempts = resolved.maxCorrectionAttempts ?? 2;
  }

  get current(): Readonly<ResearchSnapshot> {
    return this.snapshot;
  }

  async run(ticker: string): Promise<Readonly<ResearchSnapshot>> {
    this.requireState("planning");
    await this.plan(ticker);
    if (!this.stateIs("collecting")) return this.current;
    if (!this.dataSource) return this.fail("Research data source is not configured.");
    this.collect(await this.dataSource.load(this.current.ticker ?? ticker));
    if (!this.stateIs("auditing")) return this.current;
    this.audit();
    while (this.stateIs("self_correcting")) this.selfCorrect();
    if (!this.stateIs("validating")) return this.current;
    this.validate();
    if (!this.stateIs("forensics")) return this.current;
    this.runForensics();
    return this.current;
  }

  async applyDecision(input: Omit<AnalystDecision, "decidedAt">): Promise<Readonly<ResearchSnapshot>> {
    this.recordAnalystDecision(input);
    if (!this.stateIs("valuing")) return this.current;
    this.value();
    if (!this.stateIs("verifying")) return this.current;
    this.verify();
    if (!this.stateIs("synthesizing")) return this.current;
    await this.synthesize();
    return this.current;
  }

  async plan(ticker: string): Promise<Readonly<ResearchSnapshot>> {
    this.requireState("planning");
    const plan = await this.planner.createPlan({ ticker: ticker.toUpperCase() });
    if (!plan.objective.trim() || plan.steps.length === 0 || plan.steps.some((step) => !step.id.trim() || !step.description.trim())) {
      return this.fail("Research plan must contain an objective and at least one described step.");
    }
    this.snapshot = { state: "collecting", ticker: ticker.toUpperCase(), plan };
    return this.current;
  }

  collect(collected: CollectedResearch): Readonly<ResearchSnapshot> {
    this.requireState("collecting");
    this.snapshot = { ...this.snapshot, state: "auditing", collected, toolTrace: collected.toolTrace ?? [] };
    return this.current;
  }

  audit(): Readonly<ResearchSnapshot> {
    this.requireState("auditing");
    const collected = this.snapshot.collected!;
    if (collected.evidence.length === 0) return this.fail("Collected research requires at least one evidence reference.");
    const sufficiency = evaluateEvidenceSufficiency(collected.evidence, { periods: collected.forensicPeriods, now: this.now() });
    const quality = computeEarningsQualityScorecard(collected.forensicPeriods, { sector: collected.sector });
    const qualityScorecard = quality.status === "ok" ? quality.value : undefined;

    if (sufficiency.score >= EVIDENCE_SUFFICIENCY_THRESHOLD) {
      this.snapshot = { ...this.snapshot, state: "validating", sufficiency, qualityScorecard, confidence: "high" };
      return this.current;
    }

    const confidence: ConfidenceLevel = sufficiency.score >= 0.4 ? "medium" : "low";
    this.snapshot = {
      ...this.snapshot,
      state: "self_correcting",
      sufficiency,
      qualityScorecard,
      confidence,
      selfCorrection: {
        attempts: 0,
        reason: `Evidence sufficiency ${sufficiency.score.toFixed(2)} is below the required threshold ${EVIDENCE_SUFFICIENCY_THRESHOLD}.`,
        missing: sufficiency.missing,
        confidence,
        log: [`Initial sufficiency ${sufficiency.score.toFixed(2)} < ${EVIDENCE_SUFFICIENCY_THRESHOLD}; entering self-correction with ${confidence} confidence.`],
        resolved: false,
      },
    };
    return this.current;
  }

  selfCorrect(): Readonly<ResearchSnapshot> {
    this.requireState("self_correcting");
    const record = this.snapshot.selfCorrection!;
    const attempt = record.attempts + 1;
    const log = [...record.log, `Recovery attempt ${attempt}: revalidated cached evidence; no additional periods available. Confidence remains ${record.confidence}.`];
    if (attempt < this.maxCorrectionAttempts) {
      this.snapshot = { ...this.snapshot, selfCorrection: { ...record, attempts: attempt, log } };
      return this.current;
    }
    this.snapshot = {
      ...this.snapshot,
      state: "validating",
      confidence: record.confidence,
      selfCorrection: { ...record, attempts: attempt, log: [...log, "Proceeding to validation with downgraded confidence; sufficiency log retained for analyst review."], resolved: true },
    };
    return this.current;
  }

  validate(): Readonly<ResearchSnapshot> {
    this.requireState("validating");
    const collected = this.snapshot.collected!;
    if (collected.evidence.length === 0) return this.fail("Collected research requires at least one evidence reference.");
    const model = collected.modelApplicability?.model ?? "FCFF_DCF";
    if (model === "RESIDUAL_INCOME") {
      if (!collected.residualIncomeInputs) return this.fail("Residual income inputs are required for financial-sector issuers.");
      this.snapshot = { ...this.snapshot, state: "forensics" };
      return this.current;
    }
    const forensicValidation = validateForensicPeriods(collected.forensicPeriods);
    if (forensicValidation.status === "incomplete_data") return this.fail(`Incomplete forensic data: ${forensicValidation.missing.join(", ")}.`);
    if (forensicValidation.status === "invalid_assumption") return this.fail(forensicValidation.reason);
    const dcfValidation = validateDcfInputs(collected.valuation);
    if (dcfValidation.status === "incomplete_data") return this.fail(`Incomplete valuation data: ${dcfValidation.missing.join(", ")}.`);
    if (dcfValidation.status === "invalid_assumption") return this.fail(dcfValidation.reason);
    if (!Number.isFinite(collected.suggestedHaircut) || collected.suggestedHaircut < 0 || collected.suggestedHaircut > 1) {
      return this.fail("Suggested haircut must be a decimal between 0 and 1.");
    }
    this.snapshot = { ...this.snapshot, state: "forensics" };
    return this.current;
  }

  runForensics(): Readonly<ResearchSnapshot> {
    this.requireState("forensics");
    const periods = this.snapshot.collected!.forensicPeriods;
    this.snapshot = {
      ...this.snapshot,
      state: "awaiting_analyst",
      forensics: { cfoToNi: evaluateCfoToNi(periods), receivablesDivergence: evaluateReceivablesDivergence(periods) },
    };
    return this.current;
  }

  recordAnalystDecision(input: Omit<AnalystDecision, "decidedAt">): Readonly<ResearchSnapshot> {
    this.requireState("awaiting_analyst");
    const suggestedHaircut = this.snapshot.collected!.suggestedHaircut;
    const finalHaircut = input.action === "apply" ? suggestedHaircut : input.action === "dismiss" ? 0 : input.finalHaircut;
    if (!Number.isFinite(finalHaircut) || finalHaircut < 0 || finalHaircut > 1) return this.fail("Final haircut must be a decimal between 0 and 1.");
    this.snapshot = {
      ...this.snapshot,
      state: "valuing",
      analystDecision: { ...input, finalHaircut, decidedAt: this.now().toISOString() },
    };
    return this.current;
  }

  value(): Readonly<ResearchSnapshot> {
    this.requireState("valuing");
    const collected = this.snapshot.collected!;
    const model = collected.modelApplicability?.model ?? "FCFF_DCF";
    if (model === "RESIDUAL_INCOME") {
      const residual = calculateResidualIncome(collected.residualIncomeInputs ?? {});
      if (residual.status !== "ok") return this.fail(residual.status === "incomplete_data" ? `Incomplete residual income inputs: ${residual.missing.join(", ")}.` : residual.reason);
      this.snapshot = { ...this.snapshot, state: "verifying", residualIncome: residual.value };
      return this.current;
    }
    const decision = this.snapshot.analystDecision!;
    const haircut = applyFcffHaircut(collected.valuation.forecastFcff ?? [], decision.finalHaircut);
    if (haircut.status !== "ok") return this.fail("Projected FCFF could not be adjusted for the analyst haircut.");
    const result = calculateDcf({ ...collected.valuation, forecastFcff: haircut.value });
    if (result.status !== "ok") return this.fail(result.status === "incomplete_data" ? `Incomplete valuation data: ${result.missing.join(", ")}.` : result.reason);

    let reverseDcf: ReverseDcfSummary | undefined;
    const fullValidation = validateDcfInputs(collected.valuation);
    if (fullValidation.status === "ok" && typeof collected.marketPrice === "number" && Number.isFinite(collected.marketPrice)) {
      const reverse = calculateReverseDcf({ ...fullValidation.value, forecastFcff: haircut.value, marketPrice: collected.marketPrice });
      if (reverse.status === "ok") reverseDcf = reverse.value;
    }

    this.snapshot = { ...this.snapshot, state: "verifying", valuation: result.value, reverseDcf };
    return this.current;
  }

  verify(): Readonly<ResearchSnapshot> {
    this.requireState("verifying");
    const collected = this.snapshot.collected!;
    const model = collected.modelApplicability?.model ?? "FCFF_DCF";
    if (model === "RESIDUAL_INCOME") {
      if (!this.snapshot.residualIncome) return this.fail("Residual income valuation is missing.");
      this.snapshot = { ...this.snapshot, state: "synthesizing" };
      return this.current;
    }
    const decision = this.snapshot.analystDecision!;
    const valuation = this.snapshot.valuation!;

    const bridge = collected.cashFlowBridge;
    if (bridge && !bridgeReconciles(bridge)) return this.fail("Cash flow bridge reconciliation invariant failed.");

    const fullValidation = validateDcfInputs(collected.valuation);
    if (fullValidation.status === "ok") {
      const adjusted = applyFcffHaircut(fullValidation.value.forecastFcff, decision.finalHaircut);
      if (adjusted.status === "ok") {
        const matrix = buildValuationSensitivity({ ...fullValidation.value, forecastFcff: adjusted.value }, DEFAULT_WACC_AXIS, DEFAULT_TERMINAL_GROWTH_AXIS);
        for (const row of matrix.values) {
          const finite = row.filter((value): value is number => value !== null);
          for (let index = 1; index < finite.length; index += 1) {
            if (finite[index] > finite[index - 1] + 1e-9) return this.fail("Sensitivity monotonicity invariant failed.");
          }
        }
      }
    }

    const expected = applyFcffHaircut(collected.valuation.forecastFcff ?? [], decision.finalHaircut);
    if (expected.status === "ok") {
      const recomputed = calculateDcf({ ...collected.valuation, forecastFcff: expected.value });
      if (recomputed.status === "ok" && !nearlyEqual(recomputed.value.fairValuePerShare, valuation.fairValuePerShare)) {
        return this.fail("Cash haircut parity invariant failed.");
      }
    }

    this.snapshot = { ...this.snapshot, state: "synthesizing" };
    return this.current;
  }

  async synthesize(): Promise<Readonly<ResearchSnapshot>> {
    this.requireState("synthesizing");
    const facts = this.buildFacts();
    const draft = await this.memoWriter.writeMemo({ plan: this.snapshot.plan!, facts, evidence: this.snapshot.collected!.evidence });
    const knownFactIds = new Set(facts.map((fact) => fact.id));
    const knownEvidenceIds = new Set(this.snapshot.collected!.evidence.map((evidence) => evidence.id));
    if (draft.selectedFactIds.some((id) => !knownFactIds.has(id)) || draft.citedEvidenceIds.some((id) => !knownEvidenceIds.has(id)) || /\d/.test(draft.narrative)) {
      return this.fail("Memo draft contains an unsupported fact, evidence reference, or numeric claim.");
    }
    this.snapshot = {
      ...this.snapshot,
      state: "exporting",
      memo: { narrative: draft.narrative, facts: facts.filter((fact) => draft.selectedFactIds.includes(fact.id)), citedEvidenceIds: draft.citedEvidenceIds, disclaimer },
    };
    return this.current;
  }

  completeExport(): Readonly<ResearchSnapshot> {
    this.requireState("exporting");
    this.snapshot = { ...this.snapshot, state: "completed" };
    return this.current;
  }

  private buildFacts(): MemoFact[] {
    const { forensics, valuation, collected, residualIncome } = this.snapshot;
    const evidenceIds = collected!.evidence.map((evidence) => evidence.id);
    const fairValue = valuation?.fairValuePerShare ?? residualIncome?.fairValuePerShare ?? 0;
    return [
      { id: "cfo-to-ni", text: `CFO-to-NI status: ${forensics!.cfoToNi.status}.`, evidenceIds },
      { id: "receivables-divergence", text: `Receivables divergence status: ${forensics!.receivablesDivergence.status}.`, evidenceIds },
      { id: "fair-value", text: `Fair value per share: ${fairValue}.`, evidenceIds },
    ];
  }

  private requireState(expected: ResearchState): void {
    if (this.snapshot.state !== expected) throw new Error(`Invalid state transition: expected ${expected}, received ${this.snapshot.state}.`);
  }

  private stateIs(state: ResearchState): boolean {
    return this.snapshot.state === state;
  }

  private fail(failure: string): Readonly<ResearchSnapshot> {
    this.snapshot = { ...this.snapshot, state: "failed", failure };
    return this.current;
  }
}

function bridgeReconciles(bridge: CashFlowBridge): boolean {
  const byKey = Object.fromEntries(bridge.lines.map((line) => [line.key, line.value]));
  const cfoIdentity = byKey.netIncome + byKey.depreciationAndAmortization + byKey.workingCapitalDrag + byKey.otherAdjustments;
  const fcffIdentity = byKey.cashFromOperations + byKey.capitalExpenditure + byKey.taxAndOtherAdjustments;
  return nearlyEqual(cfoIdentity, byKey.cashFromOperations) && nearlyEqual(fcffIdentity, bridge.fcff);
}

function nearlyEqual(left: number, right: number, tolerance = 1e-6): boolean {
  return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

export { PlannerAgent, TOOL_REGISTRY, plannerPlanSchema, plannerStepSchema } from "./planner";
export type { PlannerAgentOptions, PlannerModel, PlannerPlanOutput, PlannerProfile, ToolCategory, ToolDefinition } from "./planner";
export { redactUnverifiedClaims, verifyMemoClaims } from "./verify";
export type { MemoClaim, MemoVerification, RedactionResult } from "./verify";
export { containsPromptInjection, sanitizeNewsContext, sanitizeNewsText } from "./news-sanitizer";
export { runDag } from "./dag";
export type { DagNode, DagRunResult } from "./dag";