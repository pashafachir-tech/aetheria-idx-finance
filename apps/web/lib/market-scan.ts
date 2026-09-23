export type SectorKey = "all" | "energy" | "financials" | "infrastructure" | "consumer" | "industrials";

export interface SectorFilter {
  key: SectorKey;
  label: string;
  emoji: string;
}

export const SECTOR_FILTERS: SectorFilter[] = [
  { key: "all", label: "Semua Sektor", emoji: "🌐" },
  { key: "energy", label: "Energi & Pertambangan", emoji: "⚡" },
  { key: "financials", label: "Finansial & Perbankan", emoji: "🏦" },
  { key: "infrastructure", label: "Infrastruktur & Logistik", emoji: "🏗️" },
  { key: "consumer", label: "Consumer Goods", emoji: "🛒" },
  { key: "industrials", label: "Industri Dasar", emoji: "🏭" },
];

export interface ScanCatalyst {
  id: string;
  sector: Exclude<SectorKey, "all">;
  sectorLabel: string;
  ticker: string;
  title: string;
  why: string;
  metricLabel: string;
  metricValue: string;
  preview: boolean;
  cfoNi: number;
  fairValueAboveMarket: boolean;
  divergence: number;
}

export interface ScanLeader {
  id: string;
  sector: Exclude<SectorKey, "all">;
  sectorLabel: string;
  ticker: string;
  name: string;
  signal: string;
  signalType: "accrual" | "dso" | "value";
  metricLabel: string;
  metricValue: string;
  direction: "warning" | "opportunity";
  preview: boolean;
  cfoNi: number;
  fairValueAboveMarket: boolean;
  divergence: number;
}

export type ScreenKey = "all" | "cash" | "value" | "accrual";

export interface ScreenFilter {
  key: ScreenKey;
  label: string;
  emoji: string;
}

export const SCREEN_FILTERS: ScreenFilter[] = [
  { key: "all", label: "Semua Saham", emoji: "🌐" },
  { key: "cash", label: "Arus Kas Sehat (CFO/NI > 0.85x)", emoji: "💧" },
  { key: "value", label: "Valuasi Diskon (Fair Value > Market)", emoji: "💎" },
  { key: "accrual", label: "Watchlist Akrual (Divergensi Tinggi)", emoji: "⚠️" },
];

export const SCAN_CATALYSTS: ScanCatalyst[] = [
  {
    id: "cat-akra",
    sector: "energy",
    sectorLabel: "Energi & Pertambangan",
    ticker: "AKRA",
    title: "Ekspansi JIIPE & kawasan industri terintegrasi",
    why: "DSO naik +2.8 hari dan divergensi piutang 1.92x menekan Earnings Quality ke Grade C; arus kas operasi 20.4% di bawah laba bersih, sehingga ekspansi kawasan perlu diuji terhadap modal kerja.",
    metricLabel: "Earnings Quality",
    metricValue: "Grade C 66/100",
    preview: false,
    cfoNi: 0.8,
    fairValueAboveMarket: false,
    divergence: 1.92,
  },
  {
    id: "cat-pgas",
    sector: "energy",
    sectorLabel: "Energi & Pertambangan",
    ticker: "PGAS",
    title: "Volume distribusi gas & margin pipa",
    why: "Konversi kas di atas 1.0x dengan margin distribusi stabil; ekspansi volume gas kawasan industri menopang pendapatan berulang dan kualitas laba.",
    metricLabel: "CFO / NI",
    metricValue: "1.05x",
    preview: true,
    cfoNi: 1.05,
    fairValueAboveMarket: true,
    divergence: 1.1,
  },
  {
    id: "cat-bmri",
    sector: "financials",
    sectorLabel: "Finansial & Perbankan",
    ticker: "BMRI",
    title: "Pertumbuhan kredit vs biaya modal ekuitas",
    why: "Engine router memilih Residual Income Model: nilai ditentukan oleh ROE terhadap cost of equity dan pertumbuhan nilai buku, bukan FCFF.",
    metricLabel: "Model",
    metricValue: "Residual Income",
    preview: true,
    cfoNi: 0.95,
    fairValueAboveMarket: true,
    divergence: 1.2,
  },
  {
    id: "cat-jsmr",
    sector: "infrastructure",
    sectorLabel: "Infrastruktur & Logistik",
    ticker: "JSMR",
    title: "Belanja modal infrastruktur & sensitivitas WACC",
    why: "Intensitas capex tinggi menekan FCFF; valuasi paling sensitif terhadap WACC pada matriks sensitivitas 2D.",
    metricLabel: "Sensitivity",
    metricValue: "High WACC beta",
    preview: true,
    cfoNi: 0.7,
    fairValueAboveMarket: false,
    divergence: 1.3,
  },
  {
    id: "cat-icbp",
    sector: "consumer",
    sectorLabel: "Consumer Goods",
    ticker: "ICBP",
    title: "Pertumbuhan pendapatan moderat & risiko piutang rendah",
    why: "Divergensi piutang rendah dan konversi kas stabil; kualitas laba ditopang struktur modal kerja yang disiplin.",
    metricLabel: "Receivables divergence",
    metricValue: "1.10x",
    preview: true,
    cfoNi: 0.92,
    fairValueAboveMarket: true,
    divergence: 1.1,
  },
];

export const SCAN_LEADERS: ScanLeader[] = [
  {
    id: "lead-akra",
    sector: "energy",
    sectorLabel: "Energi & Pertambangan",
    ticker: "AKRA",
    name: "PT AKR Corporindo Tbk",
    signal: "Accrual warning: piutang tumbuh 1.92x lebih cepat dari pendapatan",
    signalType: "accrual",
    metricLabel: "DSO (latest)",
    metricValue: "36.3 hari (+2.8) DSO",
    direction: "warning",
    preview: false,
    cfoNi: 0.8,
    fairValueAboveMarket: false,
    divergence: 1.92,
  },
  {
    id: "lead-bbca",
    sector: "financials",
    sectorLabel: "Finansial & Perbankan",
    ticker: "BBCA",
    name: "Bank Central Asia",
    signal: "Premium valuasi vs nilai buku; ROE tinggi menopang residual income",
    signalType: "value",
    metricLabel: "ROE vs cost of equity",
    metricValue: "Positive ROE vs CoE spread",
    direction: "opportunity",
    preview: true,
    cfoNi: 1.1,
    fairValueAboveMarket: true,
    divergence: 1.05,
  },
  {
    id: "lead-tlkm",
    sector: "infrastructure",
    sectorLabel: "Infrastruktur & Logistik",
    ticker: "TLKM",
    name: "Telkom Indonesia",
    signal: "DSO spike terdeteksi pada periode terakhir",
    signalType: "dso",
    metricLabel: "ΔDSO",
    metricValue: "+9.4 hari ΔDSO",
    direction: "warning",
    preview: true,
    cfoNi: 0.78,
    fairValueAboveMarket: false,
    divergence: 1.45,
  },
  {
    id: "lead-asii",
    sector: "consumer",
    sectorLabel: "Consumer Goods",
    ticker: "ASII",
    name: "Astra International",
    signal: "Diskon valuasi terhadap fair value FCFF deterministik",
    signalType: "value",
    metricLabel: "Fair value gap",
    metricValue: "Fair Value Discount",
    direction: "opportunity",
    preview: true,
    cfoNi: 0.9,
    fairValueAboveMarket: true,
    divergence: 1.15,
  },
  {
    id: "lead-untr",
    sector: "energy",
    sectorLabel: "Energi & Pertambangan",
    ticker: "UNTR",
    name: "United Tractors",
    signal: "Akrual operasi meningkat terhadap pendapatan",
    signalType: "accrual",
    metricLabel: "Accrual / Revenue",
    metricValue: "8.1% Accrual/Rev",
    direction: "warning",
    preview: true,
    cfoNi: 0.72,
    fairValueAboveMarket: false,
    divergence: 1.6,
  },
];

export const FEATURED_TICKERS: Array<{ ticker: string; sector: SectorKey; name: string }> = [
  { ticker: "AKRA", sector: "energy", name: "AKR Corporindo" },
  { ticker: "PGAS", sector: "energy", name: "Perusahaan Gas Negara" },
  { ticker: "BMRI", sector: "financials", name: "Bank Mandiri" },
  { ticker: "BBCA", sector: "financials", name: "Bank Central Asia" },
  { ticker: "JSMR", sector: "infrastructure", name: "Jasa Marga" },
  { ticker: "TLKM", sector: "infrastructure", name: "Telkom Indonesia" },
  { ticker: "ICBP", sector: "consumer", name: "Indofood CBP" },
  { ticker: "ASII", sector: "consumer", name: "Astra International" },
  { ticker: "SMGR", sector: "industrials", name: "Semen Indonesia" },
  { ticker: "UNTR", sector: "energy", name: "United Tractors" },
];

export function filterCatalysts(sector: SectorKey): ScanCatalyst[] {
  return sector === "all" ? SCAN_CATALYSTS : SCAN_CATALYSTS.filter((catalyst) => catalyst.sector === sector);
}

export function filterLeaders(sector: SectorKey): ScanLeader[] {
  return sector === "all" ? SCAN_LEADERS : SCAN_LEADERS.filter((leader) => leader.sector === sector);
}

export function sectorLabel(key: SectorKey): string {
  return SECTOR_FILTERS.find((filter) => filter.key === key)?.label ?? "Semua Sektor";
}

function matchesScreen(item: { cfoNi: number; fairValueAboveMarket: boolean; divergence: number }, screen: ScreenKey): boolean {
  if (screen === "cash") return item.cfoNi > 0.85;
  if (screen === "value") return item.fairValueAboveMarket;
  if (screen === "accrual") return item.divergence >= 1.5;
  return true;
}

export function screenCatalysts(sector: SectorKey, screen: ScreenKey): ScanCatalyst[] {
  return filterCatalysts(sector).filter((item) => matchesScreen(item, screen));
}

export function screenLeaders(sector: SectorKey, screen: ScreenKey): ScanLeader[] {
  return filterLeaders(sector).filter((item) => matchesScreen(item, screen));
}

function activeSectorSet(sectors: SectorKey[]): Set<Exclude<SectorKey, "all">> | null {
  if (sectors.length === 0 || sectors.includes("all")) return null;
  return new Set(sectors.filter((sector): sector is Exclude<SectorKey, "all"> => sector !== "all"));
}

export function screenCatalystsFor(sectors: SectorKey[], screen: ScreenKey): ScanCatalyst[] {
  const active = activeSectorSet(sectors);
  return SCAN_CATALYSTS.filter((item) => (active === null || active.has(item.sector)) && matchesScreen(item, screen));
}

export function screenLeadersFor(sectors: SectorKey[], screen: ScreenKey): ScanLeader[] {
  const active = activeSectorSet(sectors);
  return SCAN_LEADERS.filter((item) => (active === null || active.has(item.sector)) && matchesScreen(item, screen));
}

export function searchTickers(query: string): Array<{ ticker: string; sector: SectorKey; name: string }> {
  const normalized = query.trim().toUpperCase();
  if (!normalized) return FEATURED_TICKERS;

  const startsWithTicker = FEATURED_TICKERS.filter((item) => item.ticker.startsWith(normalized));
  const containsTicker = FEATURED_TICKERS.filter(
    (item) => !item.ticker.startsWith(normalized) && item.ticker.includes(normalized)
  );
  const containsName = FEATURED_TICKERS.filter(
    (item) => !item.ticker.includes(normalized) && item.name.toUpperCase().includes(normalized)
  );

  return [...startsWithTicker, ...containsTicker, ...containsName];
}