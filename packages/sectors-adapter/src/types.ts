/**
 * Typed response schemas for official Sectors API v2 endpoints.
 */

export interface IdxMarketSummaryData {
  as_of: string;
  ihsg_index: number;
  ihsg_change_pct: number;
  total_market_cap: number; // IDR, e.g. Rp 11,850 T
  daily_turnover: number; // IDR, e.g. Rp 14.5 T
  daily_volume: number; // shares or lots
  net_foreign_regular: number; // IDR, e.g. +Rp 680 M
  advancers: number;
  decliners: number;
  unchanged: number;
}

export interface MostTradedStockItem {
  symbol: string;
  company_name: string;
  price: number;
  volume: number;
  turnover: number;
  change: number;
}

export interface TopCompanyMoversData {
  gainers: MostTradedStockItem[];
  losers: MostTradedStockItem[];
}

export interface FreeFloatData {
  symbol: string;
  as_of: string;
  public_shares: number;
  total_shares: number;
  free_float_pct: number;
  minimum_threshold_pct: number; // 7.5% per BEI regulation
  compliant: boolean;
  risk_label: "HEALTHY_FLOAT" | "LOW_PUBLIC_FLOAT_RISK";
}

export interface QuarterlyFinancialItem {
  fiscal_year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  period_end: string;
  revenue: number;
  net_income: number;
  operating_cash_flow: number;
  accounts_receivable: number;
  cfo_to_ni_ratio: number;
}

export interface QuarterlySeasonalityYear {
  year: number;
  q1_net_income: number;
  q2_net_income: number;
  q3_net_income: number;
  q4_net_income: number;
  q1_q3_avg: number;
  q4_jump_ratio: number;
  cfo_growth_pct: number;
  window_dressing_suspect: boolean;
}

export interface QuarterlyFinancialsData {
  symbol: string;
  as_of: string;
  quarterly_records: QuarterlyFinancialItem[];
  seasonality_matrix: QuarterlySeasonalityYear[];
  window_dressing_detected: boolean;
  window_dressing_flags: string[];
  window_dressing_badge: "POTENTIAL Q4 WINDOW DRESSING DETECTED" | "CLEAN SEASONAL CONVERSION";
}

export interface StockSuspensionItem {
  symbol: string;
  suspension_date: string;
  unsuspend_date?: string;
  reason: string;
  board: string;
  uma_flag: boolean;
}

export interface StockSuspensionsData {
  symbol: string;
  status: "CLEAN TRADING RECORD" | "SUSPENDED" | "UNUSUAL MARKET ACTIVITY";
  currently_suspended: boolean;
  suspended_last_12m: boolean;
  score_penalty: number; // -10 if suspended in last 12m, 0 otherwise
  history: StockSuspensionItem[];
}

export interface CorporateActionItem {
  action_type: string;
  record_date?: string;
  payment_date?: string;
  event_date?: string;
  cum_date?: string;
  ex_date?: string;
  amount?: number;
  ratio?: string;
  currency?: string;
  dividend_yield?: number;
  description?: string;
}

export interface CorporateActionsData {
  symbol: string;
  actions: CorporateActionItem[];
}

export interface ShareholdersCompositionData {
  symbol: string;
  controlling_shareholders: Array<{ name: string; percentage: number }>;
  institutional_pct: number;
  retail_pct: number;
  foreign_pct: number;
  domestic_pct: number;
  total_shareholders: number;
  public_float_pct?: number;
  low_float_risk?: boolean;
}

export interface BrokerTradeItem {
  broker_code: string;
  broker_name: string;
  lot: number;
  value: number; // IDR
  avg_price: number;
  is_foreign_or_inst: boolean;
}

export interface TopBuyersSellersData {
  symbol: string;
  date: string;
  top_buyers: BrokerTradeItem[];
  top_sellers: BrokerTradeItem[];
  inst_buyer_val: number;
  retail_buyer_val: number;
  inst_seller_val: number;
  retail_seller_val: number;
  dominance_status: "BIG ACCUMULATION" | "NEUTRAL" | "DISTRIBUTION PRESSURE";
  summary_narrative: string;
  is_available?: boolean;
}

export interface CompanyFilingItem {
  title: string;
  date: string;
  category: string;
  url: string;
}

export interface CompanyFilingsData {
  symbol: string;
  filings: CompanyFilingItem[];
}

export interface DailyNetForeignItem {
  date: string;
  net_foreign: number;
  foreign_buy: number;
  foreign_sell: number;
}

export interface BrokerSummaryItem {
  broker_code: string;
  broker_name: string;
  net_value: number;
  net_volume: number;
}

export interface TopAccumDistData {
  symbol: string;
  top_accumulations: BrokerSummaryItem[];
  top_distributions: BrokerSummaryItem[];
}

export interface RevenueSegmentItem {
  segment: string;
  revenue: number;
  percentage: number;
  currency: string;
}

export interface CompanyRevenueSegmentsData {
  symbol: string;
  year: number;
  segments: RevenueSegmentItem[];
}

export interface SubsectorReportData {
  subsector: string;
  company_count: number;
  avg_pe: number;
  avg_pbv: number;
  median_roe: number;
  total_market_cap: number;
  top_performers: Array<{ symbol: string; market_cap: number; ytd_return: number }>;
}

export interface MarketNewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  date: string;
  related_symbols?: string[];
}
