import { randomUUID } from "node:crypto";
import { DomainError, type MarketSnapshot, type AnnualFinancialStatement } from "../../../packages/domain/src/index";
import { createSectorsAdapter, sectorsConfigFromEnv, type SectorsAdapter, type SectorsClient } from "../../../packages/sectors-adapter/src/index";
import { FileEvidenceCache } from "../../../packages/evidence-store/src/index";
import {
  AgentOrchestrator,
  type CollectedResearch,
  type MemoWriter,
  type ResearchDataSource,
  type ResearchPlanner,
  type ResearchSnapshot,
  type AnalystDecision,
} from "../../../packages/agent-orchestrator/src/index";
import {
  applyFcffHaircut,
  calculateFcff,
  calculateReverseDcf,
  evaluateReceivablesDivergence,
  type DcfInputs,
  type ReverseDcfValue,
} from "../../../packages/finance-engine/src/index";
import { createResearchWorkbook } from "../../../packages/xlsx-export/src/index";
import profileFixture from "../../../fixtures/akra/company-profile.json";
import financialsFixture from "../../../fixtures/akra/financial-statements.json";
import marketFixture from "../../../fixtures/akra/daily-market-data.json";
import peersFixture from "../../../fixtures/akra/subsector-peers.json";

export const demoAssumptions = {
  wacc: 0.12,
  terminalGrowth: 0.04,
  taxRate: 0.22,
  forecastYears: 5,
  forecastGrowthRate: 0.05,
  cash: 4_100_000_000,
  totalDebt: 11_800_000_000,
  minorityInterest: 0,
} as const;

export interface ResearchPresentation {
  marketPrice: number | null;
  historicalRevenueGrowth: number | null;
  suggestedHaircut: number;
  reverseDcf: ReverseDcfValue | null;
  mode: "live" | "fixture";
}

export class SectorsResearchDataSource implements ResearchDataSource {
  statements: AnnualFinancialStatement[] = [];
  market: MarketSnapshot | null = null;
  marketPrice: number | null = null;
  historicalRevenueGrowth: number | null = null;
  valuation: Partial<DcfInputs> = {};

  constructor(private readonly adapter: SectorsAdapter) {}

  async load(ticker: string): Promise<CollectedResearch> {
    const [profileResult, historyResult, marketResult] = await Promise.all([
      this.adapter.getCompanyProfile(ticker),
      this.adapter.getFinancialStatements(ticker),
      this.adapter.getDailyMarketData(ticker),
    ]);
    if (profileResult.data.coverage !== "supported") {
      throw new DomainError("UNSUPPORTED_SECTOR", `${ticker} is a financial-sector issuer.`, "Non-financial DCF valuation for this issuer is coming next.");
    }

    this.statements = historyResult.data.annual;
    this.market = marketResult.data;
    this.marketPrice = marketResult.data.lastPrice.value;

    const periods = this.statements.map((statement) => ({
      periodEnd: statement.periodEnd,
      netIncome: statement.netIncome.value,
      operatingCashFlow: statement.operatingCashFlow.value,
      revenue: statement.revenue.value,
      accountsReceivable: statement.accountsReceivable.value,
    }));

    const previous = this.statements.at(-2);
    const latest = this.statements.at(-1);
    if (previous && latest && previous.revenue.value !== 0) {
      this.historicalRevenueGrowth = (latest.revenue.value - previous.revenue.value) / Math.abs(previous.revenue.value);
    }

    this.valuation = this.buildForecast();
    const receivables = evaluateReceivablesDivergence(periods);
    const suggestedHaircut = receivables.status === "flagged" ? 0.15 : 0.1;
    return {
      forensicPeriods: periods,
      valuation: this.valuation,
      evidence: [profileResult.evidence, historyResult.evidence, marketResult.evidence],
      suggestedHaircut,
    };
  }

  private buildForecast(): Partial<DcfInputs> {
    const latest = this.statements.at(-1);
    if (!latest) throw new DomainError("INCOMPLETE_DATA", "No annual statements are available for forecasting.", "Retry with a ticker that has at least one annual statement.");
    const fcffResult = calculateFcff({
      ebit: latest.ebit.value,
      taxRate: demoAssumptions.taxRate,
      depreciationAndAmortization: latest.depreciationAndAmortization.value,
      capitalExpenditure: latest.capitalExpenditure.value,
      changeInNwc: latest.changeInNwc.value,
    });
    if (fcffResult.status === "incomplete_data") throw new DomainError("INCOMPLETE_DATA", `Base FCFF could not be derived: ${fcffResult.missing.join(", ")}.`, "Refresh the financial statements from the provider.");
    if (fcffResult.status === "invalid_assumption") throw new DomainError("INCOMPLETE_DATA", `Base FCFF assumptions are invalid: ${fcffResult.reason}.`, "Review the tax rate and statement inputs.");
    const forecastFcff = Array.from({ length: demoAssumptions.forecastYears }, (_, index) => fcffResult.value * (1 + demoAssumptions.forecastGrowthRate) ** (index + 1));
    return {
      forecastFcff,
      wacc: demoAssumptions.wacc,
      terminalGrowth: demoAssumptions.terminalGrowth,
      cash: demoAssumptions.cash,
      totalDebt: demoAssumptions.totalDebt,
      minorityInterest: demoAssumptions.minorityInterest,
      sharesOutstanding: this.market?.sharesOutstanding.value ?? 0,
    };
  }
}

export interface ResearchRunRecord {
  id: string;
  ticker: string;
  startedAt: string;
  orchestrator: AgentOrchestrator;
  dataSource: SectorsResearchDataSource;
  reverseDcf: ReverseDcfValue | null;
  mode: "live" | "fixture";
}

const runStore = (globalThis as { __aetheriaResearchRuns?: Map<string, ResearchRunRecord> }).__aetheriaResearchRuns ??= new Map<string, ResearchRunRecord>();

const scriptedPlanner: ResearchPlanner = {
  createPlan: async ({ ticker }) => ({
    objective: `Assess ${ticker} with Sectors evidence and deterministic valuation.`,
    steps: [
      { id: "route", description: "Confirm the issuer is non-financial and eligible for FCFF." },
      { id: "collect", description: "Collect Sectors evidence: profile, annual financials, and market snapshot." },
      { id: "validate", description: "Validate financial period completeness and DCF inputs." },
      { id: "forensics", description: "Evaluate CFO-to-NI and receivables divergence." },
      { id: "analyst", description: "Analyst checkpoint on the suggested FCFF haircut." },
      { id: "value", description: "Calculate DCF and reverse DCF with the approved haircut." },
    ],
  }),
};

const scriptedMemoWriter: MemoWriter = {
  writeMemo: async ({ facts }) => ({
    narrative: "Evidence supports the stated facts.",
    selectedFactIds: facts.map((fact) => fact.id),
    citedEvidenceIds: [...new Set(facts.flatMap((fact) => fact.evidenceIds))],
  }),
};

export function createRunAdapter(): { adapter: SectorsAdapter; mode: "live" | "fixture" } {
  if (process.env.USE_FIXTURES === "true") {
    const client: SectorsClient = {
      getCompanyProfile: async () => profileFixture,
      getFinancialStatements: async () => financialsFixture,
      getDailyMarketData: async () => marketFixture,
      getSubsectorPeers: async () => peersFixture,
    };
    return { adapter: createSectorsAdapter({ mode: "fixture", client }), mode: "fixture" };
  }
  const config = sectorsConfigFromEnv();
  return { adapter: createSectorsAdapter({ mode: "live", config }, new FileEvidenceCache()), mode: "live" };
}

export async function startResearch(ticker: string): Promise<{ id: string; snapshot: ResearchSnapshot; presentation: ResearchPresentation }> {
  const { adapter, mode } = createRunAdapter();
  const dataSource = new SectorsResearchDataSource(adapter);
  const orchestrator = new AgentOrchestrator(scriptedPlanner, scriptedMemoWriter, { dataSource });
  const record: ResearchRunRecord = { id: randomUUID(), ticker: ticker.toUpperCase(), startedAt: new Date().toISOString(), orchestrator, dataSource, reverseDcf: null, mode };
  runStore.set(record.id, record);
  const snapshot = await orchestrator.run(ticker);
  return { id: record.id, snapshot, presentation: buildPresentationForRun(record) };
}

export function getRun(id: string): ResearchRunRecord | undefined {
  return runStore.get(id);
}

export async function recordDecision(id: string, input: Omit<AnalystDecision, "decidedAt">): Promise<{ snapshot: ResearchSnapshot; presentation: ResearchPresentation }> {
  const record = requireRun(id);
  const snapshot = await record.orchestrator.applyDecision(input);
  if (snapshot.state === "exporting" || snapshot.state === "completed") replayReverseDcf(record);
  return { snapshot, presentation: buildPresentationForRun(record) };
}

export function buildRunWorkbook(id: string): Promise<Uint8Array> {
  const record = requireRun(id);
  const snapshot = record.orchestrator.current;
  if (snapshot.state !== "exporting" && snapshot.state !== "completed") {
    throw new DomainError("INCOMPLETE_DATA", `Workbook export is not available in state ${snapshot.state}.`, "Complete the analyst decision checkpoint before exporting.");
  }
  const analystDecision = snapshot.analystDecision;
  if (!analystDecision) throw new DomainError("INCOMPLETE_DATA", "The analyst decision is missing from the research run.", "Record the analyst decision before exporting.");
  const evidence = snapshot.collected?.evidence ?? [];
  return createResearchWorkbook({
    ticker: record.ticker,
    financials: record.dataSource.statements,
    market: record.dataSource.market!,
    assumptions: { ...completeValuation(record.dataSource.valuation), taxRate: demoAssumptions.taxRate, haircut: analystDecision.finalHaircut },
    analystDecision,
    evidence,
    auditTrail: [
      { timestamp: record.startedAt, state: "planning", detail: `Research run ${record.id} started for ${record.ticker} (${record.mode}).` },
      { timestamp: analystDecision.decidedAt, state: "valuing", detail: `Analyst decided "${analystDecision.action}" with haircut ${analystDecision.finalHaircut}.` },
    ],
  });
}

function completeValuation(input: Partial<DcfInputs>): DcfInputs {
  if (input.forecastFcff === undefined || input.wacc === undefined || input.terminalGrowth === undefined || input.cash === undefined || input.totalDebt === undefined || input.minorityInterest === undefined || input.sharesOutstanding === undefined) {
    throw new DomainError("INCOMPLETE_DATA", "Valuation inputs are incomplete.", "Complete the research run before exporting.");
  }
  return input as DcfInputs;
}

function replayReverseDcf(record: ResearchRunRecord): void {
  const snapshot = record.orchestrator.current;
  if (!snapshot.analystDecision || record.dataSource.marketPrice === null) return;
  const haircutApplied = applyFcffHaircut(record.dataSource.valuation.forecastFcff ?? [], snapshot.analystDecision.finalHaircut);
  if (haircutApplied.status !== "ok") return;
  const reverse = calculateReverseDcf({
    forecastFcff: haircutApplied.value,
    wacc: record.dataSource.valuation.wacc,
    terminalGrowth: record.dataSource.valuation.terminalGrowth,
    cash: record.dataSource.valuation.cash,
    totalDebt: record.dataSource.valuation.totalDebt,
    minorityInterest: record.dataSource.valuation.minorityInterest,
    sharesOutstanding: record.dataSource.valuation.sharesOutstanding,
    marketPrice: record.dataSource.marketPrice,
  });
  record.reverseDcf = reverse.status === "ok" ? reverse.value : null;
}

export function buildPresentationForRun(record: ResearchRunRecord): ResearchPresentation {
  return {
    marketPrice: record.dataSource.marketPrice,
    historicalRevenueGrowth: record.dataSource.historicalRevenueGrowth,
    suggestedHaircut: record.orchestrator.current.collected?.suggestedHaircut ?? 0.1,
    reverseDcf: record.reverseDcf,
    mode: record.mode,
  };
}

function requireRun(id: string): ResearchRunRecord {
  const record = runStore.get(id);
  if (!record) throw new DomainError("INCOMPLETE_DATA", `Research run ${id} was not found.`, "Start a new research run and retry.");
  return record;
}

export function domainErrorResponse(error: unknown): { status: number; payload: object } {
  if (error instanceof DomainError) {
    const status = error.code === "PROVIDER_FAILURE" ? 503 : error.code === "UNSUPPORTED_SECTOR" ? 422 : 422;
    return { status, payload: { code: error.code, message: error.message, recovery: error.recovery } };
  }
  return { status: 500, payload: { code: "INTERNAL", message: "Unexpected internal error.", recovery: "Retry the research run." } };
}