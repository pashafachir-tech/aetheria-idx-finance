import { DomainError } from "../../domain/src/index";
import type { SectorsClient } from "./index";
import {
  calculateBackoffDelay,
  isRetryableStatus,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from "./cache-manager";

export interface SectorsEndpoints {
  companyProfile(ticker: string): string;
  financialStatements(ticker: string): string;
  dailyMarketData(ticker: string): string;
  subsectorPeers(ticker: string): string;
  financialMetrics(ticker: string): string;
  dailyNetForeignInflow?(symbol: string): string;
  dailyNetForeignFlow?(symbol: string): string;
  topAccumDist?(symbol: string): string;
  companyRevenueSegments?(symbol: string): string;
  subsectorReport?(subsectorSlug: string): string;
  corporateActions?(symbol: string): string;
  shareholdersComposition?(symbol: string): string;
  companyFilings?(symbol: string): string;
  mostTraded?(): string;
  mostTradedStocks?(): string;
  topCompanyMovers?(): string;
  topGainers?(): string;
  topLosers?(): string;
  marketNews?(): string;
  idxMarketSummary?(): string;
  freeFloat?(symbol?: string): string;
  companyQuarterlyFinancials?(symbol: string): string;
  stockSuspensions?(symbol: string): string;
  topBuyersSellers?(symbol: string): string;
}

export const defaultSectorsEndpoints: SectorsEndpoints = {
  companyProfile: (ticker) => `/v1/companies/${ticker}`,
  financialStatements: (ticker) => `/v1/companies/${ticker}/financials`,
  dailyMarketData: (ticker) => `/v1/companies/${ticker}/daily`,
  subsectorPeers: (ticker) => `/v1/companies/${ticker}/peers`,
  financialMetrics: (ticker) => `/v1/companies/${ticker}/metrics`,
  dailyNetForeignInflow: (ticker) => `/v2/foreign-flow/${ticker}/`,
  dailyNetForeignFlow: (ticker) => `/v2/foreign-flow/${ticker}/`,
  topAccumDist: (ticker) => `/v2/top-accum-dist/?symbol=${ticker}`,
  companyRevenueSegments: (ticker) => `/v2/company-revenue-segments/${ticker}/`,
  subsectorReport: (subsectorSlug) => `/v2/subsector/report/${subsectorSlug}/`,
  corporateActions: (ticker) => `/v2/company/corporate-actions/${ticker}/`,
  shareholdersComposition: (ticker) => `/v2/company/report/${ticker}/?sections=ownership`,
  companyFilings: (ticker) => `/v2/company-filings/?symbol=${ticker}`,
  mostTraded: () => `/v2/most-traded/`,
  mostTradedStocks: () => `/v2/most-traded/`,
  topCompanyMovers: () => `/v2/companies/top-changes/?classifications=top_gainers,top_losers&periods=1d&n_stock=50`,
  topGainers: () => `/v2/companies/top-changes/?classifications=top_gainers&periods=1d&n_stock=50`,
  topLosers: () => `/v2/companies/top-changes/?classifications=top_losers&periods=1d&n_stock=50`,
  marketNews: () => `/v2/news/`,
  idxMarketSummary: () => `/v2/idx-market-summary/`,
  freeFloat: (symbol) => symbol ? `/v2/free-float/?symbol=${symbol}` : `/v2/free-float/`,
  companyQuarterlyFinancials: (symbol) => `/v2/company-quarterly-financials/${symbol}/`,
  stockSuspensions: (symbol) => `/v2/stock-suspensions/?symbol=${symbol}`,
  topBuyersSellers: (symbol) => `/v2/top-buyers-sellers/?symbol=${symbol}`,
};

export const liveSectorsEndpoints: SectorsEndpoints = {
  companyProfile: (ticker) => `company/report/${normalizeTicker(ticker)}/?sections=overview`,
  financialStatements: (ticker) => `company/financials/${normalizeTicker(ticker)}/`,
  dailyMarketData: (ticker) => `daily/${normalizeTicker(ticker)}/`,
  subsectorPeers: (ticker) => `company/report/${normalizeTicker(ticker)}/?sections=peers`,
  financialMetrics: (ticker) => `company/report/${normalizeTicker(ticker)}/?sections=financials,overview`,
  dailyNetForeignInflow: (ticker) => `v2/foreign-flow/${normalizeTicker(ticker)}/`,
  dailyNetForeignFlow: (ticker) => `v2/foreign-flow/${normalizeTicker(ticker)}/`,
  topAccumDist: (ticker) => `v2/top-accum-dist/?symbol=${normalizeTicker(ticker)}`,
  companyRevenueSegments: (ticker) => `v2/company-revenue-segments/${normalizeTicker(ticker)}/`,
  subsectorReport: (subsectorSlug) => `v2/subsector/report/${subsectorSlug}/`,
  corporateActions: (ticker) => `v2/company/corporate-actions/${normalizeTicker(ticker)}/`,
  shareholdersComposition: (ticker) => `company/report/${normalizeTicker(ticker)}/?sections=ownership`,
  companyFilings: (ticker) => `v2/company-filings/?symbol=${normalizeTicker(ticker)}`,
  mostTraded: () => `v2/most-traded/`,
  mostTradedStocks: () => `v2/most-traded/`,
  topCompanyMovers: () => `v2/companies/top-changes/?classifications=top_gainers,top_losers&periods=1d&n_stock=50`,
  topGainers: () => `v2/companies/top-changes/?classifications=top_gainers&periods=1d&n_stock=50`,
  topLosers: () => `v2/companies/top-changes/?classifications=top_losers&periods=1d&n_stock=50`,
  marketNews: () => `v2/news/`,
  idxMarketSummary: () => `v2/idx-market-summary/`,
  freeFloat: (symbol) => symbol ? `v2/free-float/?symbol=${normalizeTicker(symbol)}` : `v2/free-float/`,
  companyQuarterlyFinancials: (symbol) => `v2/company-quarterly-financials/${normalizeTicker(symbol)}/`,
  stockSuspensions: (symbol) => `v2/stock-suspensions/?symbol=${normalizeTicker(symbol)}`,
  topBuyersSellers: (symbol) => `v2/top-buyers-sellers/?symbol=${normalizeTicker(symbol)}`,
};

export interface SectorsApiConfig {
  baseUrl: string;
  apiKey?: string;
  endpoints?: Partial<SectorsEndpoints>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export class SectorsRestClient implements SectorsClient {
  protected readonly baseUrl: string;
  protected readonly apiKey?: string;
  protected readonly endpoints: SectorsEndpoints;
  protected readonly fetcher: typeof fetch;
  protected readonly timeoutMs: number;

  constructor(config: SectorsApiConfig) {
    if (!config.baseUrl.trim()) {
      throw new DomainError("INVALID_PROVIDER_PAYLOAD", "Sectors API base URL is required in live mode.", "Provide a baseUrl in the live SectorsApiConfig.");
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    const cleanKey = config.apiKey?.trim().replace(/^["']|["']$/g, "");
    this.apiKey = cleanKey || undefined;
    this.endpoints = { ...defaultSectorsEndpoints, ...config.endpoints };
    this.fetcher = config.fetcher ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 10000;
  }

  getCompanyProfile = async (ticker: string): Promise<unknown> => {
    return this.request("company-profile", this.endpoints.companyProfile(normalizeTicker(ticker)));
  };

  getFinancialStatements = async (ticker: string): Promise<unknown> => {
    return this.request("financial-statements", this.endpoints.financialStatements(normalizeTicker(ticker)));
  };

  getSubsectorPeers = async (ticker: string): Promise<unknown> => {
    return this.request("subsector-peers", this.endpoints.subsectorPeers(normalizeTicker(ticker)));
  };

  getDailyMarketData = async (ticker: string): Promise<unknown> => {
    return this.request("daily-market-data", this.endpoints.dailyMarketData(normalizeTicker(ticker)));
  };

  getFinancialMetrics = async (ticker: string): Promise<unknown> => {
    return this.request("financial-metrics", this.endpoints.financialMetrics(normalizeTicker(ticker)));
  };

  getDailyNetForeignInflow = async (symbol: string): Promise<unknown> => {
    const fn = this.endpoints.dailyNetForeignInflow ?? defaultSectorsEndpoints.dailyNetForeignInflow!;
    return this.request("daily-net-foreign-inflow", fn(normalizeTicker(symbol)));
  };

  getDailyNetForeignFlow = async (symbol: string): Promise<unknown> => {
    return this.getDailyNetForeignInflow(symbol);
  };

  getTopAccumulationsAndDistributions = async (symbol: string): Promise<unknown> => {
    const fn = this.endpoints.topAccumDist ?? defaultSectorsEndpoints.topAccumDist!;
    return this.request("top-accum-dist", fn(normalizeTicker(symbol)));
  };

  getCompanyRevenueSegments = async (symbol: string): Promise<unknown> => {
    const fn = this.endpoints.companyRevenueSegments ?? defaultSectorsEndpoints.companyRevenueSegments!;
    return this.request("company-revenue-segments", fn(normalizeTicker(symbol)));
  };

  getSubsectorAggregatedReport = async (subsectorSlug: string): Promise<unknown> => {
    const fn = this.endpoints.subsectorReport ?? defaultSectorsEndpoints.subsectorReport!;
    return this.request("subsector-report", fn(subsectorSlug));
  };

  getCorporateActions = async (symbol: string): Promise<unknown> => {
    const fn = this.endpoints.corporateActions ?? defaultSectorsEndpoints.corporateActions!;
    return this.request("corporate-actions", fn(normalizeTicker(symbol)));
  };

  getShareholdersComposition = async (symbol: string): Promise<unknown> => {
    const fn = this.endpoints.shareholdersComposition ?? defaultSectorsEndpoints.shareholdersComposition!;
    return this.request("shareholders-composition", fn(normalizeTicker(symbol)));
  };

  getCompanyFilings = async (symbol: string): Promise<unknown> => {
    const fn = this.endpoints.companyFilings ?? defaultSectorsEndpoints.companyFilings!;
    return this.request("company-filings", fn(normalizeTicker(symbol)));
  };

  getMostTraded = async (): Promise<unknown> => {
    const fn = this.endpoints.mostTraded ?? defaultSectorsEndpoints.mostTraded!;
    return this.request("most-traded", fn());
  };

  getMostTradedStocks = async (): Promise<unknown> => {
    return this.getMostTraded();
  };

  getTopCompanyMovers = async (): Promise<unknown> => {
    const fn = this.endpoints.topCompanyMovers ?? defaultSectorsEndpoints.topCompanyMovers!;
    return this.request("top-company-movers", fn());
  };

  getTopGainers = async (): Promise<unknown> => {
    const fn = this.endpoints.topGainers ?? defaultSectorsEndpoints.topGainers!;
    return this.request("top-gainers", fn());
  };

  getTopLosers = async (): Promise<unknown> => {
    const fn = this.endpoints.topLosers ?? defaultSectorsEndpoints.topLosers!;
    return this.request("top-losers", fn());
  };

  getMarketNews = async (): Promise<unknown> => {
    const fn = this.endpoints.marketNews ?? defaultSectorsEndpoints.marketNews!;
    return this.request("market-news", fn());
  };

  getIdxMarketSummary = async (): Promise<unknown> => {
    const fn = this.endpoints.idxMarketSummary ?? defaultSectorsEndpoints.idxMarketSummary!;
    return this.request("idx-market-summary", fn());
  };

  getFreeFloat = async (symbol?: string): Promise<unknown> => {
    const fn = this.endpoints.freeFloat ?? defaultSectorsEndpoints.freeFloat!;
    return this.request("free-float", fn(symbol ? normalizeTicker(symbol) : undefined));
  };

  getCompanyQuarterlyFinancials = async (symbol: string): Promise<unknown> => {
    const fn = this.endpoints.companyQuarterlyFinancials ?? defaultSectorsEndpoints.companyQuarterlyFinancials!;
    return this.request("company-quarterly-financials", fn(normalizeTicker(symbol)));
  };

  getStockSuspensions = async (symbol: string): Promise<unknown> => {
    const fn = this.endpoints.stockSuspensions ?? defaultSectorsEndpoints.stockSuspensions!;
    return this.request("stock-suspensions", fn(normalizeTicker(symbol)));
  };

  getTopBuyersSellers = async (symbol: string): Promise<unknown> => {
    const fn = this.endpoints.topBuyersSellers ?? defaultSectorsEndpoints.topBuyersSellers!;
    return this.request("top-buyers-sellers", fn(normalizeTicker(symbol)));
  };

  protected async request(operation: string, endpointPath: string): Promise<unknown> {
    const cleanPath = endpointPath.replace(/^\/+/, "");
    let url: string;
    if (cleanPath.startsWith("v2/")) {
      const rootBase = this.baseUrl.replace(/\/+$/, "").replace(/\/v[12]$/, "");
      url = `${rootBase}/${cleanPath}`;
    } else {
      const cleanBase = this.baseUrl.replace(/\/+$/, "");
      url = `${cleanBase}/${cleanPath}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = this.apiKey.startsWith("Bearer ") ? this.apiKey : `Bearer ${this.apiKey}`;
      headers["X-API-KEY"] = this.apiKey.replace(/^Bearer\s+/i, "");
    }

    let response: Response;
    try {
      response = await this.fetcher(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      if (isAbortError(error)) {
        throw new DomainError("PROVIDER_FAILURE", `Sectors ${operation} request exceeded ${this.timeoutMs}ms.`, "Check network connectivity, then increase timeoutMs via configuration and retry.");
      }
      throw new DomainError("PROVIDER_FAILURE", `Sectors ${operation} request failed.`, "Check network connectivity and the Sectors base URL, then retry.");
    }

    // 401 fallback: try Bearer <KEY> if raw was tried, or raw if Bearer was tried
    if (response.status === 401 && this.apiKey) {
      const altAuth = headers.Authorization.startsWith("Bearer ")
        ? this.apiKey.replace(/^Bearer\s+/i, "")
        : `Bearer ${this.apiKey}`;
      try {
        const retryHeaders = { ...headers, Authorization: altAuth };
        const retryRes = await this.fetcher(url, { headers: retryHeaders, signal: AbortSignal.timeout(this.timeoutMs) });
        if (retryRes.ok) {
          response = retryRes;
        }
      } catch {
        // Continue with original response handling
      }
    }

    if (!response.ok) {
      const recovery = response.status === 401 || response.status === 403
        ? "Verify SECTORS_API_KEY in server-side .env.local and the endpoint access rules in the official Sectors documentation."
        : "Check the endpoint mapping and ticker against the official Sectors documentation.";
      throw new DomainError("PROVIDER_FAILURE", `Sectors ${operation} responded with HTTP ${response.status}.`, recovery);
    }

    try {
      return await response.json();
    } catch {
      throw new DomainError("INVALID_PROVIDER_PAYLOAD", `Sectors ${operation} response is not valid JSON.`, "Verify the endpoint schema against the official Sectors documentation.");
    }
  }
}

export class LiveSectorsClient implements SectorsClient {
  private activeBaseUrl: string;
  private readonly apiKey?: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retryConfig: RetryConfig;

  constructor(config: SectorsApiConfig) {
    if (!config.baseUrl.trim()) {
      throw new DomainError("INVALID_PROVIDER_PAYLOAD", "Sectors API base URL is required in live mode.", "Provide a baseUrl in the live SectorsApiConfig.");
    }
    this.activeBaseUrl = config.baseUrl.replace(/\/+$/, "");
    const cleanKey = config.apiKey?.trim().replace(/^["']|["']$/g, "");
    this.apiKey = cleanKey || undefined;
    console.log("[Sectors Client] Initialized with key prefix:", cleanKey ? cleanKey.slice(0, 6) + "..." : "MISSING");
    this.fetcher = config.fetcher ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 6000;
    this.retryConfig = DEFAULT_RETRY_CONFIG;
  }

  getCompanyProfile = async (ticker: string): Promise<unknown> => {
    const sym = normalizeTicker(ticker);
    return this.requestWithFallback("company-profile", [
      `company/report/${sym}/?sections=overview,financials,peers`,
      `company/report/${sym}/?sections=overview`,
      `company/report/${sym}/`,
    ]);
  };

  getFinancialStatements = async (ticker: string): Promise<unknown> => {
    const sym = normalizeTicker(ticker);
    return this.requestWithFallback("financial-statements", [
      `company/financials/${sym}/`,
      `company/report/${sym}/?sections=financials`,
    ]);
  };

  getDailyMarketData = async (ticker: string): Promise<unknown> => {
    const sym = normalizeTicker(ticker);
    return this.requestWithFallback("daily-market-data", [
      `daily/${sym}/`,
    ]);
  };

  getSubsectorPeers = async (ticker: string): Promise<unknown> => {
    const sym = normalizeTicker(ticker);
    return this.requestWithFallback("subsector-peers", [
      `company/report/${sym}/?sections=peers`,
      `subsector/${sym}/`,
    ]);
  };

  getFinancialMetrics = async (ticker: string): Promise<unknown> => {
    const sym = normalizeTicker(ticker);
    return this.requestWithFallback("financial-metrics", [
      `company/report/${sym}/?sections=financials,overview`,
      `company/financials/${sym}/`,
    ]);
  };

  getDailyNetForeignInflow = async (symbol: string): Promise<unknown> => {
    const sym = normalizeTicker(symbol);
    return this.requestWithFallback("daily-net-foreign-inflow", [
      `v2/foreign-flow/${sym}/`,
      `foreign-flow/${sym}/`,
      `v2/daily-net-foreign-inflow/?symbol=${sym}`,
      `daily-net-foreign-inflow/?symbol=${sym}`,
    ]);
  };

  getDailyNetForeignFlow = async (symbol: string): Promise<unknown> => {
    return this.getDailyNetForeignInflow(symbol);
  };

  getTopAccumulationsAndDistributions = async (symbol: string): Promise<unknown> => {
    const sym = normalizeTicker(symbol);
    return this.requestWithFallback("top-accum-dist", [
      `v2/top-accum-dist/?symbol=${sym}`,
      `top-accum-dist/?symbol=${sym}`,
    ]);
  };

  getCompanyRevenueSegments = async (symbol: string): Promise<unknown> => {
    const sym = normalizeTicker(symbol);
    return this.requestWithFallback("company-revenue-segments", [
      `v2/company-revenue-segments/${sym}/`,
      `company-revenue-segments/${sym}/`,
    ]);
  };

  getSubsectorAggregatedReport = async (subsectorSlug: string): Promise<unknown> => {
    const slug = subsectorSlug.trim().toLowerCase().replace(/\s+/g, "-");
    return this.requestWithFallback("subsector-report", [
      `v2/subsector/report/${slug}/`,
      `subsector/report/${slug}/`,
    ]);
  };

  getCorporateActions = async (symbol: string): Promise<unknown> => {
    const sym = normalizeTicker(symbol);
    return this.requestWithFallback("corporate-actions", [
      `v2/company/corporate-actions/${sym}/`,
      `company/corporate-actions/${sym}/`,
      `company/report/${sym}/?sections=dividend`,
      `v2/corporate-actions/?symbol=${sym}`,
      `corporate-actions/?symbol=${sym}`,
    ]);
  };

  getCompanyDividendReport = async (symbol: string): Promise<unknown> => {
    const sym = normalizeTicker(symbol);
    return this.requestWithFallback("company-dividend-report", [
      `v2/company/report/${sym}/?sections=dividend`,
      `company/report/${sym}/?sections=dividend`,
    ]);
  };

  getShareholdersComposition = async (symbol: string): Promise<unknown> => {
    const sym = normalizeTicker(symbol);
    return this.requestWithFallback("shareholders-composition", [
      `company/report/${sym}/?sections=ownership`,
      `v2/company/report/${sym}/?sections=ownership`,
      `v2/shareholders-composition/${sym}/`,
      `shareholders-composition/${sym}/`,
      `company/report/${sym}/`,
    ]);
  };

  getCompanyFilings = async (symbol: string): Promise<unknown> => {
    const sym = normalizeTicker(symbol);
    return this.requestWithFallback("company-filings", [
      `v2/company-filings/?symbol=${sym}`,
      `company-filings/?symbol=${sym}`,
    ]);
  };

  getMostTraded = async (): Promise<unknown> => {
    return this.requestWithFallback("most-traded", [
      "v2/most-traded/",
      "most-traded/",
    ]);
  };

  getMostTradedStocks = async (): Promise<unknown> => {
    return this.getMostTraded();
  };

  getTopCompanyMovers = async (): Promise<unknown> => {
    return this.requestWithFallback("top-company-movers", [
      "v2/companies/top-changes/?classifications=top_gainers,top_losers&periods=1d&n_stock=50",
      "companies/top-changes/?classifications=top_gainers,top_losers&periods=1d&n_stock=50",
      "v2/top-company-movers/",
      "top-company-movers/",
    ]);
  };

  getTopGainers = async (): Promise<unknown> => {
    return this.requestWithFallback("top-gainers", [
      "v2/companies/top-changes/?classifications=top_gainers&periods=1d&n_stock=50",
      "companies/top-changes/?classifications=top_gainers&periods=1d&n_stock=50",
      "v2/top-gainers/",
      "top-gainers/",
    ]);
  };

  getTopLosers = async (): Promise<unknown> => {
    return this.requestWithFallback("top-losers", [
      "v2/companies/top-changes/?classifications=top_losers&periods=1d&n_stock=50",
      "companies/top-changes/?classifications=top_losers&periods=1d&n_stock=50",
      "v2/top-losers/",
      "top-losers/",
    ]);
  };

  getMarketNews = async (): Promise<unknown> => {
    return this.requestWithFallback("market-news", [
      "v2/news/",
      "news/",
    ]);
  };

  getIdxMarketSummary = async (): Promise<unknown> => {
    return this.requestWithFallback("idx-market-summary", [
      "v2/idx-market-summary/",
      "idx-market-summary/",
    ]);
  };

  getFreeFloat = async (symbol?: string): Promise<unknown> => {
    const sym = symbol ? normalizeTicker(symbol) : "";
    return this.requestWithFallback("free-float", [
      sym ? `v2/free-float/?symbol=${sym}` : "v2/free-float/",
      sym ? `free-float/?symbol=${sym}` : "free-float/",
    ]);
  };

  getCompanyQuarterlyFinancials = async (symbol: string): Promise<unknown> => {
    const sym = normalizeTicker(symbol);
    return this.requestWithFallback("company-quarterly-financials", [
      `v2/company-quarterly-financials/${sym}/`,
      `v2/company/quarterly-financials/${sym}/`,
      `company-quarterly-financials/${sym}/`,
      `company/quarterly-financials/${sym}/`,
      `company/report/${sym}/?sections=financials,overview`,
      `company/report/${sym}/`,
    ]);
  };

  getStockSuspensions = async (symbol: string): Promise<unknown> => {
    const sym = normalizeTicker(symbol);
    return this.requestWithFallback("stock-suspensions", [
      `v2/stock-suspensions/?symbol=${sym}`,
      `stock-suspensions/?symbol=${sym}`,
    ]);
  };

  getTopBuyersSellers = async (symbol: string): Promise<unknown> => {
    const sym = normalizeTicker(symbol);
    return this.requestWithFallback("top-buyers-sellers", [
      `v2/top-buyers-sellers/?symbol=${sym}`,
      `v2/broker-activity/?symbol=${sym}`,
      `top-buyers-sellers/?symbol=${sym}`,
      `broker-activity/?symbol=${sym}`,
      `v2/top-buyers-sellers/${sym}/`,
      `company/report/${sym}/?sections=ownership`,
      `company/report/${sym}/`,
    ]);
  };

  private async requestWithFallback(operation: string, candidates: string[]): Promise<unknown> {
    let lastError: unknown;
    for (const endpointPath of candidates) {
      try {
        return await this.executeRequest(operation, endpointPath);
      } catch (err) {
        lastError = err;
        // If it's a 401, 403, or 429, don't try next endpoint - these are auth/rate-limit errors
        if (err instanceof DomainError && err.code === "PROVIDER_FAILURE") {
          if (err.message.includes("401") || err.message.includes("403") || err.message.includes("429")) {
            throw err;
          }
        }
      }
    }
    throw lastError;
  }

  private async executeRequest(operation: string, endpointPath: string): Promise<unknown> {
    return this.executeWithRetry(operation, endpointPath, 0);
  }

  private async executeWithRetry(operation: string, endpointPath: string, attempt: number): Promise<unknown> {
    const cleanPath = endpointPath.replace(/^\/+/, "");
    let cleanBase = this.activeBaseUrl.replace(/\/+$/, "");
    let url: string;
    if (cleanPath.startsWith("v2/")) {
      const rootBase = cleanBase.replace(/\/v[12]$/, "");
      url = `${rootBase}/${cleanPath}`;
    } else {
      url = `${cleanBase}/${cleanPath}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = this.apiKey.startsWith("Bearer ") ? this.apiKey : this.apiKey;
      headers["X-API-KEY"] = this.apiKey.replace(/^Bearer\s+/i, "");
    }

    let response: Response;
    try {
      response = await this.fetcher(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      // Retry on network/timeout errors
      if (attempt < this.retryConfig.maxRetries - 1) {
        const delay = calculateBackoffDelay(attempt, this.retryConfig);
        console.log(`[Sectors Retry] attempt ${attempt + 1}/${this.retryConfig.maxRetries} for ${operation} (${delay}ms delay, network error)`);
        await sleep(delay);
        return this.executeWithRetry(operation, endpointPath, attempt + 1);
      }
      if (isAbortError(error)) {
        throw new DomainError("PROVIDER_FAILURE", `Sectors ${operation} request exceeded ${this.timeoutMs}ms after ${attempt + 1} attempts.`, "Check network connectivity, then increase timeoutMs via configuration and retry.");
      }
      throw new DomainError("PROVIDER_FAILURE", `Sectors ${operation} request failed after ${attempt + 1} attempts: ${error instanceof Error ? error.message : "Network error"}`, "Check network connectivity and the Sectors base URL, then retry.");
    }

    // Handle v1 sunset 410 migration automatically
    if (response.status === 410 && this.activeBaseUrl.includes("/v1")) {
      const body = await response.json().catch(() => null) as { v2_base_url?: string } | null;
      const v2Url = body?.v2_base_url?.replace(/\/+$/, "") || "https://api.sectors.app/v2";
      this.activeBaseUrl = v2Url;
      const newBase = this.activeBaseUrl.replace(/\/+$/, "");
      url = `${newBase}/${cleanPath}`;
      try {
        response = await this.fetcher(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (error) {
        throw new DomainError("PROVIDER_FAILURE", `Sectors ${operation} retry on v2 failed: ${error instanceof Error ? error.message : "Network error"}`, "Check network connectivity and retry.");
      }
    }

    // Retry on transient server errors (429, 502, 503)
    if (isRetryableStatus(response.status, this.retryConfig) && attempt < this.retryConfig.maxRetries - 1) {
      const delay = calculateBackoffDelay(attempt, this.retryConfig);
      console.log(`[Sectors Retry] attempt ${attempt + 1}/${this.retryConfig.maxRetries} for ${operation} (${delay}ms delay, HTTP ${response.status})`);
      await sleep(delay);
      return this.executeWithRetry(operation, endpointPath, attempt + 1);
    }

    // 401 fallback: try Bearer <KEY> if raw was tried, or raw if Bearer was tried
    if (response.status === 401 && this.apiKey) {
      const altAuth = headers.Authorization.startsWith("Bearer ")
        ? this.apiKey.replace(/^Bearer\s+/i, "")
        : `Bearer ${this.apiKey}`;
      try {
        const retryHeaders = { ...headers, Authorization: altAuth };
        const retryRes = await this.fetcher(url, { headers: retryHeaders, signal: AbortSignal.timeout(this.timeoutMs) });
        if (retryRes.ok) {
          response = retryRes;
        }
      } catch {
        // Continue with original response handling
      }
    }

    if (!response.ok) {
      if (operation === "company-quarterly-financials") {
        console.warn("[Sectors Router] Quarterly endpoint status:", response.status, url);
      }
      if (response.status === 401) {
        throw new DomainError("PROVIDER_FAILURE", `Sectors ${operation} responded with HTTP 401 (Unauthorized): Invalid or missing SECTORS_API_KEY.`, "Verify SECTORS_API_KEY in server-side .env.local and check your Sectors account status.");
      }
      if (response.status === 403) {
        throw new DomainError("PROVIDER_FAILURE", `Sectors ${operation} responded with HTTP 403 (Forbidden): Access denied for this endpoint or quota exceeded.`, "Check endpoint permissions and tier quota on Sectors Insider.");
      }
      if (response.status === 429) {
        throw new DomainError("PROVIDER_FAILURE", `Sectors ${operation} responded with HTTP 429 (Too Many Requests): Rate limit reached after ${attempt + 1} attempts.`, "Wait a few moments before retrying or check your monthly quota.");
      }
      const recovery = "Check the endpoint mapping and ticker against the official Sectors documentation.";
      throw new DomainError("PROVIDER_FAILURE", `Sectors ${operation} responded with HTTP ${response.status}.`, recovery);
    }

    try {
      return await response.json();
    } catch {
      throw new DomainError("INVALID_PROVIDER_PAYLOAD", `Sectors ${operation} response is not valid JSON.`, "Verify the endpoint schema against the official Sectors documentation.");
    }
  }
}

export function normalizeTicker(ticker: string): string {
  const value = ticker.trim().toUpperCase().replace(/\.JK$/i, "");
  if (!/^[A-Z0-9]{1,20}$/.test(value)) {
    throw new DomainError("INVALID_PROVIDER_PAYLOAD", `Invalid ticker "${ticker}".`, "An IDX ticker must be 1-20 alphanumeric characters.");
  }
  return value;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}