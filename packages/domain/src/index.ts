export type CacheStatus = "hit" | "miss";

export interface EvidenceRef {
  id: string;
  provider: "sectors";
  operation: string;
  retrievedAt: string;
  reportingPeriod?: string;
  sourceField?: string;
  cacheStatus: CacheStatus;
}

export interface Evidenced<T> {
  value: T;
  evidence: EvidenceRef;
  sourceCurrency?: string;
  periodEnd?: string;
  originalPrecision?: number;
}

export interface AdapterResult<T> {
  data: T;
  evidence: EvidenceRef;
  toolCall: ToolCallRecord;
}

export interface ToolCallRecord {
  operation: string;
  evidenceId: string;
  cacheStatus: "HIT" | "MISS";
  latencyMs: number;
  timestamp: string;
}

export interface EvidenceSufficiencyResult {
  score: number;
  periodCoverage: number;
  itemCoverage: number;
  freshness: number;
  missing: string[];
}

export interface ReverseDcfSummary {
  impliedTerminalGrowth: number;
  impliedEnterpriseValue: number;
}

export type AssumptionSource = "SECTORS_API_DERIVED" | "HISTORICAL_BASELINE";

export interface AssumptionRecord {
  key: string;
  value: number;
  unit: string;
  source: AssumptionSource;
  version: number;
}

export type QualityGrade = "A" | "B" | "C" | "D";

export interface PeriodQualityMetrics {
  periodEnd: string;
  cfoToNiRatio: number;
  dsoDays: number;
  accrualToRevenueRatio: number;
}

export interface QualityThresholds {
  targetCfoNi: number;
  maxDivergence: number;
  maxDsoDays: number;
}

export interface EarningsQualityScorecard {
  score: number;
  grade: QualityGrade;
  gradeLabel: string;
  periods: PeriodQualityMetrics[];
  dsoTrendDays: number;
  receivablesDivergence: number;
  sectorThresholds: QualityThresholds;
}

export interface RawResponseCache {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export interface RawCacheEntry {
  raw: unknown;
  evidence: EvidenceRef;
}

export type IssuerCoverage = "supported" | "coming_next";

export interface CompanyProfile {
  ticker: Evidenced<string>;
  name: Evidenced<string>;
  sector: Evidenced<string>;
  subsector: Evidenced<string>;
  coverage: IssuerCoverage;
}

export interface AnnualFinancialStatement {
  fiscalYear: number;
  periodEnd: string;
  currency: string;
  revenue: Evidenced<number>;
  netIncome: Evidenced<number>;
  operatingCashFlow: Evidenced<number>;
  accountsReceivable: Evidenced<number>;
  ebit: Evidenced<number>;
  depreciationAndAmortization: Evidenced<number>;
  capitalExpenditure: Evidenced<number>;
  changeInNwc: Evidenced<number>;
}

export interface FinancialHistory {
  ticker: string;
  annual: AnnualFinancialStatement[];
}

export interface MarketSnapshot {
  ticker: Evidenced<string>;
  asOf: string;
  lastPrice: Evidenced<number>;
  sharesOutstanding: Evidenced<number>;
  currency: string;
  historicalSeries?: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

export interface PeerCompany {
  ticker: Evidenced<string>;
  name: Evidenced<string>;
  marketCapitalization: Evidenced<number>;
  pe?: number;
  pbv?: number;
  roe?: number;
  margin?: number;
}

export interface SubsectorPeers {
  subsector: string;
  companies: PeerCompany[];
}

export interface NewsSource {
  outlet: string;
  url: string;
}

export interface RelatedTicker {
  ticker: string;
  note: string;
}

export interface NewsItem {
  id: string;
  title: string;
  aiSummary: string;
  body: string;
  sentiment: "positive" | "neutral" | "negative";
  tag: string;
  source: NewsSource;
  related: RelatedTicker[];
}

export interface BankMetrics {
  ticker: Evidenced<string>;
  periodEnd: string;
  bookValuePerShare: Evidenced<number>;
  roe: Evidenced<number>;
  costOfEquity: Evidenced<number>;
  dividendPerShare: Evidenced<number>;
  payoutRatio: Evidenced<number>;
  netInterestMargin: Evidenced<number>;
  nonPerformingLoan: Evidenced<number>;
}

export type DomainErrorCode =
  | "INVALID_PROVIDER_PAYLOAD"
  | "INCOMPLETE_DATA"
  | "UNSUPPORTED_SECTOR"
  | "PROVIDER_FAILURE";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly recovery: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
