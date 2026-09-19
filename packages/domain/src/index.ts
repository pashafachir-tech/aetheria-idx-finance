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
}

export interface PeerCompany {
  ticker: Evidenced<string>;
  name: Evidenced<string>;
  marketCapitalization: Evidenced<number>;
}

export interface SubsectorPeers {
  subsector: string;
  companies: PeerCompany[];
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
