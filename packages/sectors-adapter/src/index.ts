import {
  type AdapterResult,
  type AnnualFinancialStatement,
  type CompanyProfile,
  DomainError,
  type EvidenceRef,
  type Evidenced,
  type FinancialHistory,
  type MarketSnapshot,
  type PeerCompany,
  type RawCacheEntry,
  type RawResponseCache,
  type SubsectorPeers,
} from "../../domain/src/index";
import { FileEvidenceCache } from "../../evidence-store/src/index";
import { defaultSectorsEndpoints, SectorsRestClient, type SectorsApiConfig, type SectorsEndpoints } from "./client";

export { SectorsRestClient, defaultSectorsEndpoints };
export type { SectorsApiConfig, SectorsEndpoints };
export type { RawResponseCache } from "../../domain/src/index";

export interface SectorsClient {
  getCompanyProfile(ticker: string): Promise<unknown>;
  getFinancialStatements(ticker: string): Promise<unknown>;
  getSubsectorPeers(ticker: string): Promise<unknown>;
  getDailyMarketData(ticker: string): Promise<unknown>;
}

type RawProfile = {
  data?: { symbol?: unknown; company_name?: unknown; sector?: unknown; subsector?: unknown };
};

type RawFinancials = {
  data?: Array<{
    fiscal_year?: unknown;
    period_end?: unknown;
    currency?: unknown;
    revenue?: unknown;
    net_income?: unknown;
    operating_cash_flow?: unknown;
    accounts_receivable?: unknown;
    ebit?: unknown;
    depreciation_and_amortization?: unknown;
    capital_expenditure?: unknown;
    change_in_nwc?: unknown;
  }>;
};

type RawMarketData = {
  data?: {
    symbol?: unknown;
    as_of?: unknown;
    last_price?: unknown;
    shares_outstanding?: unknown;
    currency?: unknown;
  };
};

type RawPeers = {
  data?: { subsector?: unknown; companies?: Array<{ symbol?: unknown; company_name?: unknown; market_cap?: unknown }> };
};

const financialSectors = new Set(["Financials", "Banking", "Multifinance", "Insurance"]);

export class SectorsAdapter {
  constructor(
    private readonly client: SectorsClient,
    private readonly cache: RawResponseCache,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getCompanyProfile(ticker: string): Promise<AdapterResult<CompanyProfile>> {
    const loaded = await this.load("getCompanyProfile", ticker, () => this.client.getCompanyProfile(ticker));
    return mapProfile(loaded.raw as RawProfile, ticker, loaded.evidence);
  }

  async getFinancialStatements(ticker: string): Promise<AdapterResult<FinancialHistory>> {
    const loaded = await this.load("getFinancialStatements", ticker, () => this.client.getFinancialStatements(ticker));
    return mapFinancials(loaded.raw as RawFinancials, ticker, loaded.evidence);
  }

  async getDailyMarketData(ticker: string): Promise<AdapterResult<MarketSnapshot>> {
    const loaded = await this.load("getDailyMarketData", ticker, () => this.client.getDailyMarketData(ticker));
    return mapMarketData(loaded.raw as RawMarketData, ticker, loaded.evidence);
  }

  async getSubsectorPeers(ticker: string): Promise<AdapterResult<SubsectorPeers>> {
    const loaded = await this.load("getSubsectorPeers", ticker, () => this.client.getSubsectorPeers(ticker));
    return mapPeers(loaded.raw as RawPeers, ticker, loaded.evidence);
  }

  private async load(operation: string, ticker: string, request: () => Promise<unknown>): Promise<{ raw: unknown; evidence: EvidenceRef }> {
    const key = `sectors:${operation}:${ticker.toUpperCase()}`;
    const cached = await this.cache.get(key);
    if (isCacheEntry(cached)) return { raw: cached.raw, evidence: { ...cached.evidence, cacheStatus: "hit" as const } };

    const raw = await request();
    const retrievedAt = this.now().toISOString();
    const baseEvidence: EvidenceRef = {
      id: `sectors:${operation}:${ticker.toUpperCase()}:${retrievedAt}`,
      provider: "sectors",
      operation,
      retrievedAt,
      cacheStatus: "miss",
    };
    await this.cache.set(key, { raw, evidence: baseEvidence } satisfies RawCacheEntry);
    return { raw, evidence: baseEvidence };
  }
}

export type LiveSectorsOptions = { mode: "live"; config: SectorsApiConfig };
export type FixtureSectorsOptions = { mode: "fixture"; client: SectorsClient };

export function createSectorsAdapter(options: LiveSectorsOptions | FixtureSectorsOptions, cache?: RawResponseCache, now?: () => Date): SectorsAdapter {
  if (options.mode === "live") {
    return new SectorsAdapter(new SectorsRestClient(options.config), cache ?? new FileEvidenceCache(), now);
  }
  return new SectorsAdapter(options.client, cache ?? inMemoryCache(), now);
}

export function sectorsConfigFromEnv(env: Partial<NodeJS.ProcessEnv> = process.env): SectorsApiConfig {
  const baseUrl = env.SECTORS_API_BASE_URL?.trim();
  if (!baseUrl) {
    throw new DomainError("PROVIDER_FAILURE", "SECTORS_API_BASE_URL is not configured.", "Set SECTORS_API_BASE_URL and SECTORS_API_KEY in server-side .env.local. Never expose the key to the browser.");
  }
  const apiKey = env.SECTORS_API_KEY?.trim() || undefined;
  return { baseUrl, apiKey };
}

function inMemoryCache(): RawResponseCache {
  const values = new Map<string, unknown>();
  return { get: async (key) => values.get(key), set: async (key, value) => void values.set(key, value) };
}

function isCacheEntry(value: unknown): value is RawCacheEntry {
  return typeof value === "object" && value !== null && "raw" in value && "evidence" in value;
}

function fieldEvidence(base: EvidenceRef, sourceField: string, reportingPeriod?: string): EvidenceRef {
  return { ...base, sourceField, reportingPeriod };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim()) return value;
  throw incomplete(field);
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw incomplete(field);
}

function incomplete(field: string): DomainError {
  return new DomainError("INCOMPLETE_DATA", `Sectors response is missing a valid ${field}.`, "Refresh the data source or select an issuer with complete reported data.");
}

function invalidProviderPayload(detail: string): DomainError {
  return new DomainError("INVALID_PROVIDER_PAYLOAD", `Sectors response failed validation: ${detail}`, "Verify the payload against the official Sectors documentation and retry.");
}

function assertTickerMatches(payloadSymbol: string, requestedTicker: string): void {
  if (payloadSymbol.trim().toUpperCase() !== requestedTicker.trim().toUpperCase()) {
    throw invalidProviderPayload(`symbol "${payloadSymbol}" does not match requested ticker "${requestedTicker}".`);
  }
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function evidenced<T>(value: T, base: EvidenceRef, sourceField: string, periodEnd?: string, currency?: string): Evidenced<T> {
  return {
    value,
    evidence: fieldEvidence(base, sourceField, periodEnd),
    sourceCurrency: currency,
    periodEnd,
    originalPrecision: typeof value === "number" ? decimalPlaces(value) : undefined,
  };
}

function decimalPlaces(value: number): number {
  const decimal = String(value).split(".")[1];
  return decimal?.length ?? 0;
}

function mapProfile(raw: RawProfile, ticker: string, base: EvidenceRef): AdapterResult<CompanyProfile> {
  const data = raw?.data ?? {};
  const symbol = requiredString(data.symbol, "data.symbol");
  assertTickerMatches(symbol, ticker);
  const sector = requiredString(data.sector, "data.sector");
  return {
    evidence: base,
    data: {
      ticker: evidenced(symbol.toUpperCase(), base, "data.symbol"),
      name: evidenced(requiredString(data.company_name, "data.company_name"), base, "data.company_name"),
      sector: evidenced(sector, base, "data.sector"),
      subsector: evidenced(requiredString(data.subsector, "data.subsector"), base, "data.subsector"),
      coverage: financialSectors.has(sector) ? "coming_next" : "supported",
    },
  };
}

function mapFinancials(raw: RawFinancials, ticker: string, base: EvidenceRef): AdapterResult<FinancialHistory> {
  if (!Array.isArray(raw?.data) || raw.data.length === 0) throw incomplete("data");
  const envelopeSymbol = typeof (raw as { symbol?: unknown }).symbol === "string" ? (raw as { symbol: string }).symbol : undefined;
  if (envelopeSymbol?.trim()) assertTickerMatches(envelopeSymbol, ticker);

  const rows = raw.data.map((row) => {
    const periodEnd = requiredString(row.period_end, "data[].period_end");
    if (!isIsoDate(periodEnd)) throw invalidProviderPayload(`periodEnd "${periodEnd}" is not a valid ISO date (YYYY-MM-DD).`);
    return { row, periodEnd };
  });
  const seen = new Set<string>();
  for (const { periodEnd } of rows) {
    if (seen.has(periodEnd)) throw invalidProviderPayload(`duplicate periodEnd "${periodEnd}".`);
    seen.add(periodEnd);
  }
  rows.sort((a, b) => Date.parse(a.periodEnd) - Date.parse(b.periodEnd));

  const annual = rows.map(({ row, periodEnd }): AnnualFinancialStatement => {
    const currency = requiredString(row.currency, "data[].currency");
    const value = (field: keyof typeof row) => evidenced(requiredNumber(row[field], `data[].${field}`), base, `data[].${field}`, periodEnd, currency);
    return {
      fiscalYear: requiredNumber(row.fiscal_year, "data[].fiscal_year"), periodEnd, currency,
      revenue: value("revenue"), netIncome: value("net_income"), operatingCashFlow: value("operating_cash_flow"),
      accountsReceivable: value("accounts_receivable"), ebit: value("ebit"),
      depreciationAndAmortization: value("depreciation_and_amortization"), capitalExpenditure: value("capital_expenditure"), changeInNwc: value("change_in_nwc"),
    };
  });
  return { data: { ticker: ticker.toUpperCase(), annual }, evidence: base };
}

function mapMarketData(raw: RawMarketData, ticker: string, base: EvidenceRef): AdapterResult<MarketSnapshot> {
  const data = raw?.data ?? {};
  const symbol = requiredString(data.symbol, "data.symbol");
  assertTickerMatches(symbol, ticker);
  const asOf = requiredString(data.as_of, "data.as_of");
  const currency = requiredString(data.currency, "data.currency");
  return { evidence: base, data: {
    ticker: evidenced(symbol.toUpperCase(), base, "data.symbol", asOf),
    asOf, currency,
    lastPrice: evidenced(requiredNumber(data.last_price, "data.last_price"), base, "data.last_price", asOf, currency),
    sharesOutstanding: evidenced(requiredNumber(data.shares_outstanding, "data.shares_outstanding"), base, "data.shares_outstanding", asOf),
  } };
}

function mapPeers(raw: RawPeers, ticker: string, base: EvidenceRef): AdapterResult<SubsectorPeers> {
  const data = raw?.data ?? {};
  if (!Array.isArray(data.companies)) throw incomplete("data.companies");
  const companies = data.companies.map((company): PeerCompany => ({
    ticker: evidenced(requiredString(company.symbol, "data.companies[].symbol").toUpperCase(), base, "data.companies[].symbol"),
    name: evidenced(requiredString(company.company_name, "data.companies[].company_name"), base, "data.companies[].company_name"),
    marketCapitalization: evidenced(requiredNumber(company.market_cap, "data.companies[].market_cap"), base, "data.companies[].market_cap", undefined, "IDR"),
  }));
  return { data: { subsector: requiredString(data.subsector, "data.subsector"), companies }, evidence: base };
}