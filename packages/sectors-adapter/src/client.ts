import { DomainError } from "../../domain/src/index";
import type { SectorsClient } from "./index";

export interface SectorsEndpoints {
  companyProfile(ticker: string): string;
  financialStatements(ticker: string): string;
  dailyMarketData(ticker: string): string;
  subsectorPeers(ticker: string): string;
}

export const defaultSectorsEndpoints: SectorsEndpoints = {
  companyProfile: (ticker) => `/v1/companies/${ticker}`,
  financialStatements: (ticker) => `/v1/companies/${ticker}/financials`,
  dailyMarketData: (ticker) => `/v1/companies/${ticker}/daily`,
  subsectorPeers: (ticker) => `/v1/companies/${ticker}/peers`,
};

export interface SectorsApiConfig {
  baseUrl: string;
  apiKey?: string;
  endpoints?: Partial<SectorsEndpoints>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export class SectorsRestClient implements SectorsClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly endpoints: SectorsEndpoints;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: SectorsApiConfig) {
    if (!config.baseUrl.trim()) {
      throw new DomainError("INVALID_PROVIDER_PAYLOAD", "Sectors API base URL is required in live mode.", "Provide a baseUrl in the live SectorsApiConfig.");
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.endpoints = { ...defaultSectorsEndpoints, ...config.endpoints };
    this.fetcher = config.fetcher ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 10000;
  }

  async getCompanyProfile(ticker: string): Promise<unknown> {
    return this.request("company-profile", this.endpoints.companyProfile(normalizeTicker(ticker)));
  }

  async getFinancialStatements(ticker: string): Promise<unknown> {
    return this.request("financial-statements", this.endpoints.financialStatements(normalizeTicker(ticker)));
  }

  async getSubsectorPeers(ticker: string): Promise<unknown> {
    return this.request("subsector-peers", this.endpoints.subsectorPeers(normalizeTicker(ticker)));
  }

  async getDailyMarketData(ticker: string): Promise<unknown> {
    return this.request("daily-market-data", this.endpoints.dailyMarketData(normalizeTicker(ticker)));
  }

  private async request(operation: string, endpointPath: string): Promise<unknown> {
    const url = `${this.baseUrl}/${endpointPath.replace(/^\/+/, "")}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    let response: Response;
    try {
      response = await this.fetcher(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      if (isAbortError(error)) {
        throw new DomainError("PROVIDER_FAILURE", `Sectors ${operation} request exceeded ${this.timeoutMs}ms.`, "Check network connectivity, then increase timeoutMs via configuration and retry.");
      }
      throw new DomainError("PROVIDER_FAILURE", `Sectors ${operation} request failed.`, "Check network connectivity and the Sectors base URL, then retry.");
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

export function normalizeTicker(ticker: string): string {
  const value = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,20}$/.test(value)) {
    throw new DomainError("INVALID_PROVIDER_PAYLOAD", `Invalid ticker "${ticker}".`, "An IDX ticker must be 1-20 alphanumeric characters.");
  }
  return value;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}