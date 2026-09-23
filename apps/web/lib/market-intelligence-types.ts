export interface DailyCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicators {
  lastPrice: number;
  prevPrice: number;
  ema20: number;
  ema50: number;
  ema100: number;
  rsi14: number;
  stochK: number;
  stochD: number;
  prevStochK: number;
  prevStochD: number;
  support20: number;
  resistance20: number;
  // Detected Setups
  isTestingEma100: boolean;
  isBullishEmaRebound: boolean;
  isRsiOversold: boolean;
  isRsiMomentumBreakout: boolean;
  isStochGoldenCross: boolean;
  isTestingSupport: boolean;
  isSupportRebound: boolean;
  activeSignals: string[];
}

export interface MarketCatalystItem {
  id: string;
  theme: string;
  category: "macro" | "technical" | "commodity" | "earnings";
  title: string;
  affectedTickers: string[];
  primaryTicker: string;
  sector: string;
  sectorLabel: string;
  narrative: string;
  technicalSetup: {
    signals: string[];
    rsi: number;
    stochK: number;
    stochD: number;
    ema100DistancePct: number;
    supportLevel: number;
    bias: "BULLISH REBOUND" | "OVERSOLD PIVOT" | "MOMENTUM" | "SUPPORT TEST";
  };
  metrics: {
    label: string;
    value: string;
  };
  confidence: number;
}

export type BeiStrategyPreset = "all" | "swing" | "ara_hunter" | "bsjp" | "bpjs";

export interface StrategyPresetConfig {
  key: BeiStrategyPreset;
  label: string;
  badge: string;
  criteria: string;
  description: string;
  exampleTickers: string[];
}

export const BEI_STRATEGY_PRESETS: StrategyPresetConfig[] = [
  {
    key: "all",
    label: "Semua Strategi BEI",
    badge: "SEMUA PRESET",
    criteria: "Menampilkan seluruh universe emiten terseleksi",
    description: "Monitoring menyeluruh terhadap seluruh setup teknikal kuantitatif aktif.",
    exampleTickers: ["BBCA", "BMRI", "BRIS", "AKRA", "BUMI"],
  },
  {
    key: "swing",
    label: "SWING TRADING (Trend Following)",
    badge: "TREND SWING",
    criteria: "EMA 20 >= EMA 50 · Price >= EMA 50 · RSI 50 - 65 · Vol MA Breakout",
    description: "Strategi trend following untuk menangkap siklus kenaikan multi-hari berbasis momentum moving average.",
    exampleTickers: ["BBCA", "ASII", "ICBP"],
  },
  {
    key: "ara_hunter",
    label: "ARA HUNTER (Momentum Breakout)",
    badge: "ARA HUNTER",
    criteria: "Price Gain >= +2% · Volume >= 2x Vol MA 20 · Turnover > Rp 10 Miliar",
    description: "Mendeteksi lonjakan volume dan akselerasi momentum menuju batas Auto Rejection Atas (ARA).",
    exampleTickers: ["BRIS", "MEDC", "BUMI"],
  },
  {
    key: "bsjp",
    label: "BSJP (Beli Sore Jual Pagi)",
    badge: "BSJP OVERNIGHT",
    criteria: "Price Change > 0 · Price >= EMA 20 · ROE >= 10% · Volume Akumulasi Sesi 2",
    description: "Akumulasi emiten berfundamental kokoh di akhir sesi kedua untuk merealisasikan profit pada gap pembukaan pagi.",
    exampleTickers: ["AKRA", "TLKM", "BMRI"],
  },
  {
    key: "bpjs",
    label: "BPJS / SUPPORT REBOUND (Buy on Weakness)",
    badge: "SUPPORT REBOUND",
    criteria: "Uji EMA 100 (±1.5%) · RSI Oversold (< 35 memantul) · Stoch Golden Cross (< 25)",
    description: "Strategi scalping & buy on weakness saat harga menguji support dinamis EMA 100 atau level oversold ekstrem.",
    exampleTickers: ["PGAS", "ELSA", "INDF"],
  },
];

export interface IdxMarketSummaryData {
  as_of?: string;
  ihsg_index: number;
  ihsg_change_pct: number;
  total_market_cap: number;
  daily_turnover: number;
  daily_volume: number;
  net_foreign_regular: number;
  advancers: number;
  decliners: number;
  unchanged: number;
}

export interface TechnicalLeaderItem {
  ticker: string;
  name: string;
  sector: string;
  sectorLabel: string;
  lastPrice: number;
  change1d: number;
  rsi: number;
  stochStatus: string;
  ema100Status: string;
  supportDistancePct: number;
  bias: "BULLISH REBOUND" | "OVERSOLD PIVOT" | "MOMENTUM" | "SUPPORT TEST";
  keySignal: string;
  // BEI Quantitative Strategy Matrix Presets
  strategyMatches: {
    swing: boolean;
    ara_hunter: boolean;
    bsjp: boolean;
    bpjs: boolean;
  };
  strategyTags: string[];
  strategyRationale: string;
  turnoverText: string;
  turnover?: number;
  volumeLots?: number;
  volumeRatio: number;
  roe: number;
  // On-demand live intelligence aliases & fields
  symbol?: string;
  price?: number;
  changePct?: number;
  setupTag?: string;
  setupDescription?: string;
  ema20?: number;
  ema50?: number;
  ema100?: number;
  support20?: number;
  stochK?: number;
  stochD?: number;
}

export interface MorningIntelligenceData {
  timestamp?: string;
  generatedAt: string;
  expiresAt: string;
  ttlHours: number;
  source: "llm_synthesis" | "deterministic_cache" | "fallback_quant" | "sectors_api_v2_live";
  totalUniverseScanned: number;
  macroSummary: string;
  idxMarketSummary?: IdxMarketSummaryData;
  catalysts: MarketCatalystItem[];
  leaders: TechnicalLeaderItem[];
  items?: TechnicalLeaderItem[];
  strategyPresets: StrategyPresetConfig[];
}
