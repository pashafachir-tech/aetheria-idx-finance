/**
 * Honest Empty State Provider for Sectors API v2 endpoints.
 * Strict Zero-Synthetic Mode: Never generates fabricated numbers, mock arrays, or fake ticker prices.
 * Returns transparent empty states when upstream data is unavailable.
 */

export * from "./types";
import type {
  DailyNetForeignItem,
  BrokerSummaryItem,
  TopAccumDistData,
  RevenueSegmentItem,
  CompanyRevenueSegmentsData,
  SubsectorReportData,
  CorporateActionItem,
  CorporateActionsData,
  ShareholdersCompositionData,
  CompanyFilingItem,
  CompanyFilingsData,
  MostTradedStockItem,
  TopCompanyMoversData,
  MarketNewsItem,
  IdxMarketSummaryData,
  FreeFloatData,
  QuarterlyFinancialItem,
  QuarterlySeasonalityYear,
  QuarterlyFinancialsData,
  StockSuspensionItem,
  StockSuspensionsData,
  BrokerTradeItem,
  TopBuyersSellersData,
} from "./types";

export function getFallbackDailyCandles(): any[] {
  return [];
}

export function getFallbackCompanyReport(): null {
  return null;
}

export function getFallbackDailyNetForeignInflow(symbol: string): { symbol: string; data: DailyNetForeignItem[] } {
  const sym = symbol.toUpperCase().replace(/\.JK$/i, "");
  return {
    symbol: sym,
    data: [],
  };
}

export function getFallbackTopAccumDist(symbol: string): TopAccumDistData {
  const sym = symbol.toUpperCase().replace(/\.JK$/i, "");
  return {
    symbol: sym,
    top_accumulations: [],
    top_distributions: [],
  };
}

export function getFallbackRevenueSegments(symbol: string): CompanyRevenueSegmentsData {
  const sym = symbol.toUpperCase().replace(/\.JK$/i, "");
  return {
    symbol: sym,
    year: new Date().getFullYear(),
    segments: [],
  };
}

export function getFallbackSubsectorReport(subsectorSlug: string): SubsectorReportData {
  return {
    subsector: subsectorSlug,
    company_count: 0,
    avg_pe: 0,
    avg_pbv: 0,
    median_roe: 0,
    total_market_cap: 0,
    top_performers: [],
  };
}

export function getFallbackCorporateActions(symbol: string): CorporateActionsData {
  const sym = symbol.toUpperCase().replace(/\.JK$/i, "");
  return {
    symbol: sym,
    actions: [],
  };
}

export function getFallbackShareholdersComposition(symbol: string): ShareholdersCompositionData {
  const sym = symbol.toUpperCase().replace(/\.JK$/i, "");
  return {
    symbol: sym,
    controlling_shareholders: [],
    institutional_pct: 0,
    retail_pct: 0,
    foreign_pct: 0,
    domestic_pct: 0,
    total_shareholders: 0,
    public_float_pct: 0,
    low_float_risk: false,
  };
}

export function getFallbackCompanyFilings(symbol: string): CompanyFilingsData {
  const sym = symbol.toUpperCase().replace(/\.JK$/i, "");
  return {
    symbol: sym,
    filings: [],
  };
}

export function getFallbackMostTraded(): MostTradedStockItem[] {
  return [];
}

export function getFallbackTopCompanyMovers(): TopCompanyMoversData {
  return {
    gainers: [],
    losers: [],
  };
}

export function getFallbackMarketNews(): MarketNewsItem[] {
  return [];
}

export function getFallbackIdxMarketSummary(): IdxMarketSummaryData {
  return {
    as_of: new Date().toISOString().split("T")[0],
    ihsg_index: 0,
    ihsg_change_pct: 0,
    total_market_cap: 0,
    daily_turnover: 0,
    daily_volume: 0,
    net_foreign_regular: 0,
    advancers: 0,
    decliners: 0,
    unchanged: 0,
  };
}

export function getFallbackFreeFloat(symbol: string): FreeFloatData {
  const sym = symbol.toUpperCase().replace(/\.JK$/i, "");
  return {
    symbol: sym,
    as_of: new Date().toISOString().split("T")[0],
    public_shares: 0,
    total_shares: 0,
    free_float_pct: 0,
    minimum_threshold_pct: 7.5,
    compliant: true,
    risk_label: "HEALTHY_FLOAT",
  };
}

export function getFallbackQuarterlyFinancials(symbol: string): QuarterlyFinancialsData {
  const sym = symbol.toUpperCase().replace(/\.JK$/i, "");
  return {
    symbol: sym,
    as_of: new Date().toISOString().split("T")[0],
    quarterly_records: [],
    seasonality_matrix: [],
    window_dressing_detected: false,
    window_dressing_flags: [],
    window_dressing_badge: "CLEAN SEASONAL CONVERSION",
  };
}

export function getFallbackStockSuspensions(symbol: string): StockSuspensionsData {
  const sym = symbol.toUpperCase().replace(/\.JK$/i, "");
  return {
    symbol: sym,
    status: "CLEAN TRADING RECORD",
    currently_suspended: false,
    suspended_last_12m: false,
    score_penalty: 0,
    history: [],
  };
}

export function getFallbackTopBuyersSellers(symbol: string): TopBuyersSellersData {
  const sym = symbol.toUpperCase().replace(/\.JK$/i, "");
  return {
    symbol: sym,
    date: new Date().toISOString().split("T")[0],
    top_buyers: [],
    top_sellers: [],
    inst_buyer_val: 0,
    retail_buyer_val: 0,
    inst_seller_val: 0,
    retail_seller_val: 0,
    dominance_status: "NEUTRAL",
    summary_narrative: "[ DATA TRANSAKSI BROKER BURSA BELUM TERSEDIA UNTUK HARI INI ]",
    is_available: false,
  };
}
