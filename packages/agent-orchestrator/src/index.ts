import type { EvidenceRef } from "../../domain/src/index";
import {
  applyFcffHaircut,
  calculateDcf,
  evaluateCfoToNi,
  evaluateReceivablesDivergence,
  validateDcfInputs,
  validateForensicPeriods,
  type DcfInputs,
  type DcfValue,
  type ForensicPeriod,
  type ReceivablesDivergenceResult,
  type CfoToNiResult,
} from "../../finance-engine/src/index";

export type ResearchState =
  | "planning"
  | "collecting"
  | "validating"
  | "forensics"
  | "awaiting_analyst"
  | "valuing"
  | "synthesizing"
  | "exporting"
  | "completed"
  | "failed";

export interface ResearchPlan {
  objective: string;
  steps: Array<{ id: string; description: string }>;
}

export interface ResearchPlanner {
  createPlan(input: { ticker: string }): Promise<ResearchPlan>;
}

export interface ResearchDataSource {
  load(ticker: string): Promise<CollectedResearch>;
}

export interface OrchestratorOptions {
  now?: () => Date;
  dataSource?: ResearchDataSource;
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
  disclaimer: "For research and educational use only. Not investment advice.";
}

export interface ResearchSnapshot {
  ticker?: string;
  state: ResearchState;
  plan?: ResearchPlan;
  collected?: CollectedResearch;
  forensics?: ForensicResults;
  analystDecision?: AnalystDecision;
  valuation?: DcfValue;
  memo?: ResearchMemo;
  failure?: string;
}

const disclaimer = "For research and educational use only. Not investment advice." as const;

export class AgentOrchestrator {
  private snapshot: ResearchSnapshot = { state: "planning" };
  private readonly now: () => Date;
  private readonly dataSource?: ResearchDataSource;

  constructor(
    private readonly planner: ResearchPlanner,
    private readonly memoWriter: MemoWriter,
    options: OrchestratorOptions | (() => Date) = {},
  ) {
    const resolved = typeof options === "function" ? { now: options } : options;
    this.now = resolved.now ?? (() => new Date());
    this.dataSource = resolved.dataSource;
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
    this.snapshot = { ...this.snapshot, state: "validating", collected };
    return this.current;
  }

  validate(): Readonly<ResearchSnapshot> {
    this.requireState("validating");
    const collected = this.snapshot.collected!;
    if (collected.evidence.length === 0) return this.fail("Collected research requires at least one evidence reference.");
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
    const haircut = applyFcffHaircut(collected.valuation.forecastFcff ?? [], this.snapshot.analystDecision!.finalHaircut);
    if (haircut.status !== "ok") return this.fail("Projected FCFF could not be adjusted for the analyst haircut.");
    const result = calculateDcf({ ...collected.valuation, forecastFcff: haircut.value });
    if (result.status !== "ok") return this.fail(result.status === "incomplete_data" ? `Incomplete valuation data: ${result.missing.join(", ")}.` : result.reason);
    this.snapshot = { ...this.snapshot, state: "synthesizing", valuation: result.value };
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
    const { forensics, valuation, collected } = this.snapshot;
    const evidenceIds = collected!.evidence.map((evidence) => evidence.id);
    return [
      { id: "cfo-to-ni", text: `CFO-to-NI status: ${forensics!.cfoToNi.status}.`, evidenceIds },
      { id: "receivables-divergence", text: `Receivables divergence status: ${forensics!.receivablesDivergence.status}.`, evidenceIds },
      { id: "fair-value", text: `Fair value per share: ${valuation!.fairValuePerShare}.`, evidenceIds },
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
