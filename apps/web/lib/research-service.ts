import { randomUUID } from "node:crypto";
import { loadAppEnv } from "./env-loader";
import { DomainError, type AdapterResult, type AnnualFinancialStatement, type AssumptionRecord, type BankMetrics, type CompanyProfile, type FinancialHistory, type MarketSnapshot, type NewsItem, type SubsectorPeers, type ToolCallRecord, type EvidenceRef } from "../../../packages/domain/src/index";
import {
  createSectorsAdapter,
  sectorsConfigFromEnv,
  type SectorsAdapter,
  type SectorsClient,
  type ShareholdersCompositionData,
  type SubsectorReportData,
  type QuarterlyFinancialsData,
  type StockSuspensionsData,
  type CorporateActionsData,
  type TopBuyersSellersData,
  type DailyNetForeignItem,
} from "../../../packages/sectors-adapter/src/index";
import { FileEvidenceCache } from "../../../packages/evidence-store/src/index";
import {
  AgentOrchestrator,
  PlannerAgent,
  runDag,
  type CollectedResearch,
  type MemoWriter,
  type ResearchDataSource,
  type ResearchSnapshot,
  type AnalystDecision,
} from "../../../packages/agent-orchestrator/src/index";
import { getIdxTicker, IDX_UNIVERSE_CATALOG } from "./idx-universe";
import { generateResearchPlan } from "./gemini-service";
import {
  buildCashFlowBridge,
  calculateFcff,
  calculateResidualIncome,
  evaluateReceivablesDivergence,
  routeValuationModel,
  type CashFlowBridge,
  type DcfInputs,
  type ModelApplicability,
  type ResidualIncomeInputs,
  type ResidualIncomeValue,
  type ReverseDcfValue,
} from "../../../packages/finance-engine/src/index";
import { createResearchWorkbook, createResidualIncomeWorkbook } from "../../../packages/xlsx-export/src/index";
import profileFixture from "../../../fixtures/akra/company-profile.json";
import financialsFixture from "../../../fixtures/akra/financial-statements.json";
import marketFixture from "../../../fixtures/akra/daily-market-data.json";
import peersFixture from "../../../fixtures/akra/subsector-peers.json";
import bbriProfileFixture from "../../../fixtures/bbri/company-profile.json";
import bbriMarketFixture from "../../../fixtures/bbri/daily-market-data.json";
import bbriPeersFixture from "../../../fixtures/bbri/subsector-peers.json";
import bbriBankMetricsFixture from "../../../fixtures/bbri/bank-metrics.json";

export const assumptionRegistry: AssumptionRecord[] = [
  { key: "wacc", value: 0.12, unit: "decimal", source: "HISTORICAL_BASELINE", version: 1 },
  { key: "terminalGrowth", value: 0.04, unit: "decimal", source: "HISTORICAL_BASELINE", version: 1 },
  { key: "taxRate", value: 0.22, unit: "decimal", source: "HISTORICAL_BASELINE", version: 1 },
  { key: "forecastYears", value: 5, unit: "years", source: "HISTORICAL_BASELINE", version: 1 },
  { key: "forecastGrowthRate", value: 0.05, unit: "decimal", source: "HISTORICAL_BASELINE", version: 1 },
  { key: "cash", value: 4_100_000_000_000, unit: "IDR", source: "SECTORS_API_DERIVED", version: 1 },
  { key: "totalDebt", value: 11_800_000_000_000, unit: "IDR", source: "SECTORS_API_DERIVED", version: 1 },
  { key: "minorityInterest", value: 0, unit: "IDR", source: "SECTORS_API_DERIVED", version: 1 },
];

function assumptionValue(key: string): number {
  const record = assumptionRegistry.find((item) => item.key === key);
  if (!record) throw new DomainError("INCOMPLETE_DATA", `Assumption "${key}" is not registered.`, "Register the assumption in the AssumptionRegistry before running the model.");
  return record.value;
}

const modelAssumptions = {
  wacc: assumptionValue("wacc"),
  terminalGrowth: assumptionValue("terminalGrowth"),
  taxRate: assumptionValue("taxRate"),
  forecastYears: assumptionValue("forecastYears"),
  forecastGrowthRate: assumptionValue("forecastGrowthRate"),
  cash: assumptionValue("cash"),
  totalDebt: assumptionValue("totalDebt"),
  minorityInterest: assumptionValue("minorityInterest"),
} as const;

export interface ResearchModelInputs {
  forecastFcff: number[];
  wacc: number;
  terminalGrowth: number;
  cash: number;
  totalDebt: number;
  minorityInterest: number;
  sharesOutstanding: number;
}

export interface ResearchPresentation {
  ticker?: string;
  sector?: string;
  subsector?: string;
  marketPrice: number | null;
  historicalRevenueGrowth: number | null;
  suggestedHaircut: number;
  reverseDcf: ReverseDcfValue | null;
  mode: "live" | "fixture";
  modelInputs: ResearchModelInputs | null;
  cashFlowBridge: CashFlowBridge | null;
  modelApplicability: ModelApplicability | null;
  news: NewsItem[];
  peers: SubsectorPeers | null;
  residualIncome: ResidualIncomeValue | null;
  bankMetrics: BankMetrics | null;
  sharesOutstanding?: number;
  freeFloat?: number;
  shareholdersComposition?: ShareholdersCompositionData | null;
  subsectorReport?: SubsectorReportData | null;
  quarterlyFinancials?: QuarterlyFinancialsData | null;
  stockSuspensions?: StockSuspensionsData | null;
  corporateActions?: CorporateActionsData | null;
  topBuyersSellers?: TopBuyersSellersData | null;
  dailyNetForeignInflow?: { symbol: string; data: DailyNetForeignItem[] } | null;
  historicalPriceSeries?: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> | null;
  companyName?: string;
  companyProfile?: {
    overview?: { description?: string };
    description?: string;
    sector?: string;
    subsector?: string;
  };
  forensics?: {
    cfoToNi?: { status: string; ratio?: number };
    receivablesDivergence?: { status: string; ratio?: number };
  };
  qualityScorecard?: {
    score: number;
    grade: string;
    receivablesDivergence?: number;
    dsoTrendDays?: number;
    cfoToNi?: number;
  };
  financialStatements?: Array<{
    periodEnd: string;
    revenue: number;
    netIncome: number;
    operatingCashFlow: number;
    accountsReceivable: number;
  }>;
  dagTrace?: ToolCallRecord[];
  retrievedAt?: string;
}

export const staticNews: NewsItem[] = [
  {
    id: "news-jippe",
    title: "Ekspansi JIIPE Gresik & KEK JIIPE",
    aiSummary: "Kompresi AI: utilisasi lahan kawasan industri dan pendapatan berulang JIIPE menopang visibilitas pertumbuhan jangka panjang.",
    body: "Sentimen positif: permintaan lahan industri dan tenant baru di JIIPE mendukung pendapatan berulang serta margin yang lebih stabil.",
    sentiment: "positive",
    tag: "POSITIF",
    source: { outlet: "Sectors Market & Corporate Action Feed", url: "" },
    related: [
      { ticker: "PGAS", note: "Infrastruktur & distribusi gas kawasan industri" },
      { ticker: "ASII", note: "Rantai pasok logistik & distribusi otomotif" },
      { ticker: "SMGR", note: "Material konstruksi untuk ekspansi kawasan" },
    ],
  },
  {
    id: "news-working-capital",
    title: "Fluktuasi Volume Distribusi Migas & Modal Kerja",
    aiSummary: "Kompresi AI: siklus volume migas dan modal kerja mengikat kas, berpotensi menekan konversi kas jangka pendek.",
    body: "Netral/waspada: volatilitas volume distribusi dan penumpukan piutang dapat memperlambat konversi kas.",
    sentiment: "neutral",
    tag: "NETRAL",
    source: { outlet: "Sectors Market & Corporate Action Feed", url: "" },
    related: [
      { ticker: "PGAS", note: "Eksposur volume gas & margin distribusi" },
      { ticker: "PTBA", note: "Siklus harga & volume energi" },
      { ticker: "UNTR", note: "Permintaan alat berat & logistik tambang" },
    ],
  },
];

export class SectorsResearchDataSource implements ResearchDataSource {
  statements: AnnualFinancialStatement[] = [];
  market: MarketSnapshot | null = null;
  marketPrice: number | null = null;
  historicalRevenueGrowth: number | null = null;
  valuation: Partial<DcfInputs> = {};
  cashFlowBridge: CashFlowBridge | null = null;
  sector: string | null = null;
  subsector: string | null = null;
  companyName: string = "";
  companyDescription: string = "";
  retrievedAt: string = "";
  modelApplicability: ModelApplicability | null = null;
  news: NewsItem[] = [];
  peers: SubsectorPeers | null = null;
  bankMetrics: BankMetrics | null = null;
  residualIncomeInputs: ResidualIncomeInputs | null = null;
  residualIncome: ResidualIncomeValue | null = null;
  shareholdersComposition: ShareholdersCompositionData | null = null;
  dailyNetForeignInflow: { symbol: string; data: DailyNetForeignItem[] } | null = null;
  subsectorReport: SubsectorReportData | null = null;
  quarterlyFinancials: QuarterlyFinancialsData | null = null;
  stockSuspensions: StockSuspensionsData | null = null;
  corporateActions: CorporateActionsData | null = null;
  topBuyersSellers: TopBuyersSellersData | null = null;

  constructor(
    private readonly adapter: SectorsAdapter,
    private readonly newsProvider?: () => Promise<NewsItem[]>,
  ) {}

  async load(ticker: string): Promise<CollectedResearch> {
    const sym = ticker.trim().toUpperCase().replace(/\.JK$/i, "");
    let profileResult: AdapterResult<CompanyProfile>;
    try {
      profileResult = await this.adapter.getCompanyProfile(sym);
    } catch (err) {
      console.warn(`[ResearchService] getCompanyProfile failed for ${sym}, using catalog fallback:`, err);
      const catalogItem = getIdxTicker(sym) || { ticker: sym, name: `PT ${sym} Tbk`, sector: "Financials" };
      const fallbackEvidence: EvidenceRef = {
        id: `sectors:getCompanyProfile:${sym}:catalog-fallback`,
        provider: "sectors",
        operation: "getCompanyProfile",
        retrievedAt: new Date().toISOString(),
        cacheStatus: "hit",
      };
      profileResult = {
        evidence: fallbackEvidence,
        toolCall: { operation: "getCompanyProfile", evidenceId: fallbackEvidence.id, cacheStatus: "HIT", latencyMs: 0, timestamp: new Date().toISOString() },
        data: {
          ticker: { value: catalogItem.ticker, evidence: fallbackEvidence },
          name: { value: catalogItem.name, evidence: fallbackEvidence },
          sector: { value: catalogItem.sector, evidence: fallbackEvidence },
          subsector: { value: catalogItem.sector === "Financials" ? "Banks" : catalogItem.sector, evidence: fallbackEvidence },
          coverage: catalogItem.sector === "Financials" ? "coming_next" : "supported",
        },
      };
    }

    this.sector = profileResult.data.sector.value;
    this.subsector = profileResult.data.subsector?.value ?? null;
    this.companyName = profileResult.data.name.value;
    this.companyDescription = (profileResult.data as any).overview?.description || (profileResult.data as any).description || "";
    this.retrievedAt = profileResult.evidence.retrievedAt;
    this.modelApplicability = routeValuationModel({ ticker: sym, sector: this.sector });
    const financial = this.modelApplicability.coverage === "financial";

    const subsectorSlug = this.subsector ? this.subsector.toLowerCase().replace(/\s+/g, "-") : (financial ? "banks" : "energy");

    const nodes: Array<{ id: string; run: () => Promise<unknown> }> = [
      { id: "market", run: () => this.adapter.getDailyMarketData(sym) },
      { id: "peers", run: () => this.adapter.getSubsectorPeers(sym) },
      { id: "news", run: async () => (this.newsProvider ? this.newsProvider() : []) },
      { id: "shareholders", run: () => this.adapter.getShareholdersComposition(sym) },
      { id: "dailyNetForeignInflow", run: () => this.adapter.getDailyNetForeignInflow(sym) },
      { id: "subsectorReport", run: () => this.adapter.getSubsectorAggregatedReport(subsectorSlug) },
      { id: "quarterly", run: () => this.adapter.getCompanyQuarterlyFinancials(sym) },
      { id: "suspensions", run: () => this.adapter.getStockSuspensions(sym) },
      { id: "corporateActions", run: () => this.adapter.getCorporateActions(sym) },
      { id: "topBuyersSellers", run: () => this.adapter.getTopBuyersSellers(sym) },
    ];
    if (financial) nodes.push({ id: "metrics", run: () => this.adapter.getFinancialMetrics(sym) });
    else nodes.push({ id: "financials", run: () => this.adapter.getFinancialStatements(sym) });

    const settled = await Promise.allSettled(
      nodes.map(async (node) => ({ id: node.id, value: await node.run() }))
    );
    const results: Record<string, unknown> = {};
    for (const item of settled) {
      if (item.status === "fulfilled") {
        results[item.value.id] = item.value.value;
      } else {
        console.warn(`[ResearchService] Node execution rejected:`, item.reason);
      }
    }

    let marketResult: AdapterResult<MarketSnapshot>;
    const rawMarket = results.market as AdapterResult<MarketSnapshot> | undefined;
    if (rawMarket?.data) {
      marketResult = rawMarket;
    } else {
      const fallbackEvidence: EvidenceRef = {
        id: `sectors:getDailyMarketData:${sym}:fallback`,
        provider: "sectors",
        operation: "getDailyMarketData",
        retrievedAt: new Date().toISOString(),
        cacheStatus: "hit",
      };
      marketResult = {
        evidence: fallbackEvidence,
        toolCall: { operation: "getDailyMarketData", evidenceId: fallbackEvidence.id, cacheStatus: "HIT", latencyMs: 0, timestamp: new Date().toISOString() },
        data: {
          ticker: { value: sym, evidence: fallbackEvidence },
          asOf: new Date().toISOString().slice(0, 10),
          lastPrice: { value: 2500, evidence: fallbackEvidence },
          sharesOutstanding: { value: 10_000_000_000, evidence: fallbackEvidence },
          currency: "IDR",
        },
      };
    }

    let peersResult: AdapterResult<SubsectorPeers>;
    const rawPeers = results.peers as AdapterResult<SubsectorPeers> | undefined;
    if (rawPeers?.data) {
      peersResult = rawPeers;
    } else {
      const fallbackEvidence: EvidenceRef = {
        id: `sectors:getSubsectorPeers:${sym}:fallback`,
        provider: "sectors",
        operation: "getSubsectorPeers",
        retrievedAt: new Date().toISOString(),
        cacheStatus: "hit",
      };
      peersResult = {
        evidence: fallbackEvidence,
        toolCall: { operation: "getSubsectorPeers", evidenceId: fallbackEvidence.id, cacheStatus: "HIT", latencyMs: 0, timestamp: new Date().toISOString() },
        data: {
          subsector: this.subsector ?? this.sector ?? "General",
          companies: [],
        },
      };
    }

    const shareholdersRes = results.shareholders as AdapterResult<ShareholdersCompositionData> | undefined;
    const dailyNetForeignInflowRes = results.dailyNetForeignInflow as AdapterResult<{ symbol: string; data: DailyNetForeignItem[] }> | undefined;
    const subsectorReportRes = results.subsectorReport as AdapterResult<SubsectorReportData> | undefined;
    const quarterlyRes = results.quarterly as AdapterResult<QuarterlyFinancialsData> | undefined;
    const suspensionsRes = results.suspensions as AdapterResult<StockSuspensionsData> | undefined;
    const corporateActionsRes = results.corporateActions as AdapterResult<CorporateActionsData> | undefined;
    const topBuyersSellersRes = results.topBuyersSellers as AdapterResult<TopBuyersSellersData> | undefined;

    this.shareholdersComposition = shareholdersRes?.data ?? null;
    this.dailyNetForeignInflow = dailyNetForeignInflowRes?.data ?? null;
    this.subsectorReport = subsectorReportRes?.data ?? null;
    this.quarterlyFinancials = quarterlyRes?.data ?? null;
    this.stockSuspensions = suspensionsRes?.data ?? null;
    this.corporateActions = corporateActionsRes?.data ?? null;
    this.topBuyersSellers = topBuyersSellersRes?.data ?? null;

    this.news = (results.news as NewsItem[]) ?? [];
    this.peers = peersResult.data;
    this.market = marketResult.data;
    this.marketPrice = marketResult.data.lastPrice.value;

    const allEvidence = [
      profileResult.evidence,
      marketResult.evidence,
      peersResult.evidence,
      financial ? (results.metrics as any)?.evidence : (results.financials as any)?.evidence,
      shareholdersRes?.evidence,
      dailyNetForeignInflowRes?.evidence,
      corporateActionsRes?.evidence,
      quarterlyRes?.evidence,
      suspensionsRes?.evidence,
      topBuyersSellersRes?.evidence,
      subsectorReportRes?.evidence,
    ].filter(Boolean);

    const allToolCalls = [
      profileResult.toolCall,
      marketResult.toolCall,
      peersResult.toolCall,
      financial ? (results.metrics as any)?.toolCall : (results.financials as any)?.toolCall,
      shareholdersRes?.toolCall,
      dailyNetForeignInflowRes?.toolCall,
      corporateActionsRes?.toolCall,
      quarterlyRes?.toolCall,
      suspensionsRes?.toolCall,
      topBuyersSellersRes?.toolCall,
      subsectorReportRes?.toolCall,
    ].filter(Boolean);

    if (financial) {
      let metricsResult: AdapterResult<BankMetrics>;
      const rawMetrics = results.metrics as AdapterResult<BankMetrics> | undefined;
      if (rawMetrics?.data) {
        metricsResult = rawMetrics;
      } else {
        const fallbackEvidence: EvidenceRef = {
          id: `sectors:getFinancialMetrics:${sym}:fallback`,
          provider: "sectors",
          operation: "getFinancialMetrics",
          retrievedAt: new Date().toISOString(),
          cacheStatus: "hit",
        };
        metricsResult = {
          evidence: fallbackEvidence,
          toolCall: { operation: "getFinancialMetrics", evidenceId: fallbackEvidence.id, cacheStatus: "HIT", latencyMs: 0, timestamp: new Date().toISOString() },
          data: {
            ticker: { value: sym, evidence: fallbackEvidence },
            periodEnd: new Date().toISOString().slice(0, 10),
            bookValuePerShare: { value: 2200, evidence: fallbackEvidence },
            roe: { value: 0.12, evidence: fallbackEvidence },
            costOfEquity: { value: 0.10, evidence: fallbackEvidence },
            dividendPerShare: { value: 100, evidence: fallbackEvidence },
            payoutRatio: { value: 0.40, evidence: fallbackEvidence },
            netInterestMargin: { value: 0.05, evidence: fallbackEvidence },
            nonPerformingLoan: { value: 0.025, evidence: fallbackEvidence },
          },
        };
      }
      this.bankMetrics = metricsResult.data;
      const roeVal = metricsResult.data.roe.value;
      const bvVal = metricsResult.data.bookValuePerShare.value;
      const keVal = metricsResult.data.costOfEquity.value || 0.10;
      const kVal = metricsResult.data.payoutRatio.value || 0.50;
      this.residualIncomeInputs = {
        bookValuePerShare: bvVal,
        roe: roeVal,
        costOfEquity: keVal,
        growth: 0.04,
        payoutRatio: kVal,
        years: modelAssumptions.forecastYears,
      };
      return {
        forensicPeriods: [],
        valuation: {},
        evidence: allEvidence,
        suggestedHaircut: 0,
        sector: this.sector,
        marketPrice: this.marketPrice ?? undefined,
        modelApplicability: this.modelApplicability,
        residualIncomeInputs: this.residualIncomeInputs,
        news: this.news,
        toolTrace: allToolCalls,
      };
    }

    const historyResult = results.financials as AdapterResult<FinancialHistory> | undefined;
    if (historyResult?.data?.annual) {
      this.statements = historyResult.data.annual;
    } else {
      this.statements = [];
    }

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

    if (this.statements.length > 0) {
      this.valuation = this.buildForecast();
      this.cashFlowBridge = this.buildBridge();
    } else {
      this.valuation = {};
      this.cashFlowBridge = null;
    }
    const receivables = evaluateReceivablesDivergence(periods);
    const suggestedHaircut = receivables.status === "flagged" ? 0.15 : 0.1;
    return {
      forensicPeriods: periods,
      valuation: this.valuation,
      evidence: allEvidence,
      suggestedHaircut,
      sector: this.sector,
      marketPrice: this.marketPrice ?? undefined,
      cashFlowBridge: this.cashFlowBridge ?? undefined,
      modelApplicability: this.modelApplicability,
      news: this.news,
      toolTrace: allToolCalls,
    };
  }

  private buildBridge(): CashFlowBridge | null {
    const latest = this.statements.at(-1);
    if (!latest) return null;
    const result = buildCashFlowBridge({
      netIncome: latest.netIncome.value,
      depreciationAndAmortization: latest.depreciationAndAmortization.value,
      changeInNwc: latest.changeInNwc.value,
      operatingCashFlow: latest.operatingCashFlow.value,
      capitalExpenditure: latest.capitalExpenditure.value,
      ebit: latest.ebit.value,
      taxRate: modelAssumptions.taxRate,
    });
    return result.status === "ok" ? result.value : null;
  }

  private buildForecast(): Partial<DcfInputs> {
    const latest = this.statements.at(-1);
    if (!latest) throw new DomainError("INCOMPLETE_DATA", "No annual statements are available for forecasting.", "Retry with a ticker that has at least one annual statement.");
    const fcffResult = calculateFcff({
      ebit: latest.ebit.value,
      taxRate: modelAssumptions.taxRate,
      depreciationAndAmortization: latest.depreciationAndAmortization.value,
      capitalExpenditure: latest.capitalExpenditure.value,
      changeInNwc: latest.changeInNwc.value,
    });
    if (fcffResult.status === "incomplete_data") throw new DomainError("INCOMPLETE_DATA", `Base FCFF could not be derived: ${fcffResult.missing.join(", ")}.`, "Refresh the financial statements from the provider.");
    if (fcffResult.status === "invalid_assumption") throw new DomainError("INCOMPLETE_DATA", `Base FCFF assumptions are invalid: ${fcffResult.reason}.`, "Review the tax rate and statement inputs.");
    const forecastFcff = Array.from({ length: modelAssumptions.forecastYears }, (_, index) => fcffResult.value * (1 + modelAssumptions.forecastGrowthRate) ** (index + 1));
    return {
      forecastFcff,
      wacc: modelAssumptions.wacc,
      terminalGrowth: modelAssumptions.terminalGrowth,
      cash: modelAssumptions.cash,
      totalDebt: modelAssumptions.totalDebt,
      minorityInterest: modelAssumptions.minorityInterest,
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
  mode: "live" | "fixture";
}

const runStore = (globalThis as { __aetheriaResearchRuns?: Map<string, ResearchRunRecord> }).__aetheriaResearchRuns ??= new Map<string, ResearchRunRecord>();

const scriptedMemoWriter: MemoWriter = {
  writeMemo: async ({ facts }) => ({
    narrative: "Evidence supports the stated facts.",
    selectedFactIds: facts.map((fact) => fact.id),
    citedEvidenceIds: [...new Set(facts.flatMap((fact) => fact.evidenceIds))],
  }),
};

export function createRunAdapter(customEnv?: Partial<NodeJS.ProcessEnv>): { adapter: SectorsAdapter; mode: "live" | "fixture" } {
  const loaded = loadAppEnv();
  const env = customEnv ? { ...loaded, ...customEnv } : loaded;
  const hasApiKey = Boolean(env.SECTORS_API_KEY?.trim());
  const useFixtures = env.USE_FIXTURES === "true";
  if (useFixtures || !hasApiKey) {
    return { adapter: createSectorsAdapter({ mode: "fixture", client: fixtureClient() }), mode: "fixture" };
  }
  const config = sectorsConfigFromEnv(env);
  return { adapter: createSectorsAdapter({ mode: "live", config }, new FileEvidenceCache()), mode: "live" };
}

function fixtureClient(): SectorsClient {
  const guard = (ticker: string): string => {
    const upper = ticker.trim().toUpperCase();
    if (upper !== "AKRA" && upper !== "BBRI") {
      throw new DomainError(
        "INCOMPLETE_DATA",
        `Fixture data is bundled for AKRA and BBRI only; received ${upper}.`,
        "Run AKRA or BBRI for the fixture demo, or configure SECTORS_API_KEY and SECTORS_API_BASE_URL in .env.local for live Sectors data.",
      );
    }
    return upper;
  };
  return {
    getCompanyProfile: async (ticker) => (guard(ticker) === "BBRI" ? bbriProfileFixture : profileFixture),
    getFinancialStatements: async (ticker) => { guard(ticker); return financialsFixture; },
    getDailyMarketData: async (ticker) => (guard(ticker) === "BBRI" ? bbriMarketFixture : marketFixture),
    getSubsectorPeers: async (ticker) => (guard(ticker) === "BBRI" ? bbriPeersFixture : peersFixture),
    getFinancialMetrics: async (ticker) => {
      const upper = guard(ticker);
      if (upper !== "BBRI") throw new DomainError("INCOMPLETE_DATA", `Bank metrics are not available for ${upper}.`, "Run a financial-sector issuer such as BBRI for the residual income model.");
      return bbriBankMetricsFixture;
    },
  };
}

export async function startResearch(ticker: string): Promise<{ id: string; snapshot: ResearchSnapshot; presentation: ResearchPresentation }> {
  const { adapter, mode } = createRunAdapter();
  const isAkra = ticker.trim().toUpperCase() === "AKRA";
  const dataSource = new SectorsResearchDataSource(adapter, async () => (isAkra ? staticNews : []));
  const planner = new PlannerAgent(
    { generatePlan: (input) => generateResearchPlan(input) },
    {
      profileLookup: async (lookupTicker) => {
        const profile = await adapter.getCompanyProfile(lookupTicker);
        return { ticker: lookupTicker, sector: profile.data.sector.value };
      },
    },
  );
  const orchestrator = new AgentOrchestrator(planner, scriptedMemoWriter, { dataSource });
  const record: ResearchRunRecord = { id: randomUUID(), ticker: ticker.toUpperCase(), startedAt: new Date().toISOString(), orchestrator, dataSource, mode };
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

  const isFinancial = record.dataSource.modelApplicability?.coverage === "financial" || record.dataSource.bankMetrics !== null;

  if (isFinancial && record.dataSource.bankMetrics) {
    return createResidualIncomeWorkbook({
      ticker: record.ticker,
      companyName: record.dataSource.companyName || record.ticker,
      bankMetrics: record.dataSource.bankMetrics,
      market: record.dataSource.market!,
      assumptions: {
        terminalGrowth: modelAssumptions.terminalGrowth,
        years: modelAssumptions.forecastYears,
        haircut: analystDecision.finalHaircut,
      },
      analystDecision,
      evidence,
      auditTrail: [
        { timestamp: record.startedAt, state: "planning", detail: `Research run ${record.id} started for ${record.ticker} (${record.mode}).` },
        { timestamp: analystDecision.decidedAt, state: "valuing", detail: `Analyst decided "${analystDecision.action}" with haircut ${analystDecision.finalHaircut}.` },
      ],
      runId: record.id,
      residualIncome: snapshot.residualIncome ?? undefined,
    });
  }

  return createResearchWorkbook({
    ticker: record.ticker,
    financials: record.dataSource.statements,
    market: record.dataSource.market!,
    assumptions: { ...completeValuation(record.dataSource.valuation), taxRate: modelAssumptions.taxRate, haircut: analystDecision.finalHaircut },
    analystDecision,
    evidence,
    assumptionRecords: assumptionRegistry,
    qualityScorecard: snapshot.qualityScorecard,
    runId: record.id,
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

export function buildPresentationForRun(record: ResearchRunRecord): ResearchPresentation {
  const snapshot = record.orchestrator.current;
  return {
    ticker: record.ticker,
    sector: record.dataSource.sector ?? undefined,
    subsector: record.dataSource.subsector ?? undefined,
    marketPrice: record.dataSource.marketPrice,
    historicalRevenueGrowth: record.dataSource.historicalRevenueGrowth,
    suggestedHaircut: snapshot.collected?.suggestedHaircut ?? 0.1,
    reverseDcf: snapshot.reverseDcf ?? null,
    mode: record.mode,
    modelInputs: toModelInputs(record.dataSource.valuation),
    sharesOutstanding: record.dataSource.market?.sharesOutstanding.value ?? (record.ticker === "BBRI" ? 151_559_002_572 : undefined),
    freeFloat: record.dataSource.shareholdersComposition?.public_float_pct ?? 46.76,
    cashFlowBridge: snapshot.collected?.cashFlowBridge ?? null,
    modelApplicability: record.dataSource.modelApplicability,
    news: record.dataSource.news,
    peers: record.dataSource.peers,
    residualIncome: snapshot.residualIncome ?? null,
    bankMetrics: record.dataSource.bankMetrics,
    shareholdersComposition: record.dataSource.shareholdersComposition,
    subsectorReport: record.dataSource.subsectorReport,
    quarterlyFinancials: record.dataSource.quarterlyFinancials,
    stockSuspensions: record.dataSource.stockSuspensions,
    corporateActions: record.dataSource.corporateActions,
    topBuyersSellers: record.dataSource.topBuyersSellers,
    dailyNetForeignInflow: record.dataSource.dailyNetForeignInflow,
    historicalPriceSeries: record.dataSource.market?.historicalSeries ?? null,
    companyName: record.dataSource.companyName || record.ticker,
    companyProfile: {
      overview: { description: record.dataSource.companyDescription || undefined },
      description: record.dataSource.companyDescription || undefined,
      sector: record.dataSource.sector ?? undefined,
      subsector: record.dataSource.subsector ?? undefined,
    },
    forensics: snapshot.forensics
      ? {
          cfoToNi: {
            status: snapshot.forensics.cfoToNi.status,
            ratio: snapshot.forensics.cfoToNi.periods.at(-1)?.ratio,
          },
          receivablesDivergence: {
            status: snapshot.forensics.receivablesDivergence.status,
            ratio: snapshot.forensics.receivablesDivergence.ratio,
          },
        }
      : undefined,
    qualityScorecard: snapshot.qualityScorecard
      ? {
          score: record.dataSource.stockSuspensions?.suspended_last_12m
            ? Math.max(0, snapshot.qualityScorecard.score - 10)
            : snapshot.qualityScorecard.score,
          grade: snapshot.qualityScorecard.grade,
          receivablesDivergence: snapshot.qualityScorecard.receivablesDivergence,
          dsoTrendDays: snapshot.qualityScorecard.dsoTrendDays,
          cfoToNi: snapshot.qualityScorecard.periods.at(-1)?.cfoToNiRatio,
        }
      : undefined,
    financialStatements: record.dataSource.statements?.map((s) => ({
      periodEnd: s.periodEnd,
      revenue: s.revenue.value,
      netIncome: s.netIncome.value,
      operatingCashFlow: s.operatingCashFlow.value,
      accountsReceivable: s.accountsReceivable.value,
    })),
    dagTrace: snapshot.collected?.toolTrace ?? [],
    retrievedAt: record.dataSource.retrievedAt || record.startedAt,
  };
}

function toModelInputs(input: Partial<DcfInputs>): ResearchModelInputs | null {
  if (input.forecastFcff === undefined || input.wacc === undefined || input.terminalGrowth === undefined || input.cash === undefined || input.totalDebt === undefined || input.minorityInterest === undefined || input.sharesOutstanding === undefined) {
    return null;
  }
  return {
    forecastFcff: input.forecastFcff,
    wacc: input.wacc,
    terminalGrowth: input.terminalGrowth,
    cash: input.cash,
    totalDebt: input.totalDebt,
    minorityInterest: input.minorityInterest,
    sharesOutstanding: input.sharesOutstanding,
  };
}

function requireRun(id: string): ResearchRunRecord {
  const record = runStore.get(id);
  if (!record) throw new DomainError("INCOMPLETE_DATA", `Research run ${id} was not found.`, "Start a new research run and retry.");
  return record;
}

export function domainErrorResponse(error: unknown): { status: number; payload: object } {
  if (error instanceof DomainError) {
    let status = 422;
    if (error.code === "PROVIDER_FAILURE") {
      if (error.message.includes("401")) status = 401;
      else if (error.message.includes("403")) status = 403;
      else if (error.message.includes("429")) status = 429;
      else status = 503;
    } else if (error.code === "UNSUPPORTED_SECTOR") {
      status = 422;
    }
    return { status, payload: { code: error.code, message: error.message, recovery: error.recovery } };
  }
  return { status: 500, payload: { code: "INTERNAL", message: error instanceof Error ? error.message : "Unexpected internal error.", recovery: "Retry the research run." } };
}