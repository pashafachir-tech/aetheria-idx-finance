export interface IdxRadar {
  board: string;
  supervision: string;
  autoRejectionPct: number;
  tickSize: number;
  araPrice: number | null;
  arbPrice: number | null;
  relatedPartyNote: string;
}

export function autoRejectionPctForPrice(price: number): number {
  if (price < 200) return 35;
  if (price <= 5000) return 25;
  return 20;
}

export function tickSizeForPrice(price: number): number {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

export function computeIdxRadar(ticker: string, price: number | null): IdxRadar {
  const pct = price != null && Number.isFinite(price) && price > 0 ? autoRejectionPctForPrice(price) : 25;
  return {
    board: "Papan Utama",
    supervision: "Normal",
    autoRejectionPct: pct,
    tickSize: price != null && Number.isFinite(price) && price > 0 ? tickSizeForPrice(price) : 5,
    araPrice: price != null && Number.isFinite(price) && price > 0 ? price * (1 + pct / 100) : null,
    arbPrice: price != null && Number.isFinite(price) && price > 0 ? price * (1 - pct / 100) : null,
    relatedPartyNote: "Kepatuhan transaksi pihak berelasi dan keterbukaan informasi dipantau sesuai POJK 42/2020.",
  };
}