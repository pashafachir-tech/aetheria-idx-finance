export type ArDivergenceStatus = "EXCELLENT" | "NORMAL" | "WARNING" | "CRITICAL";

export interface AdaptiveReceivablesDivergenceResult {
  arGrowth: number;
  revGrowth: number;
  ratio: number | null;
  display: string;
  status: ArDivergenceStatus;
  description: string;
}

/**
 * Logika Divergensi Piutang Adaptif:
 * Mencegah pembagian buta menghasilkan rasio negatif ekstrem (misal -33.04x).
 * Menampilkan status "Optimal Cash Inflow / Collection" jika AR Growth <= 0.
 */
export function computeAdaptiveReceivablesDivergence(
  prevArOrGrowth: number,
  latestArOrRevGrowth: number,
  prevRev?: number,
  latestRev?: number
): AdaptiveReceivablesDivergenceResult {
  let arGrowth: number;
  let revGrowth: number;

  if (prevRev === undefined || latestRev === undefined) {
    arGrowth = prevArOrGrowth;
    revGrowth = latestArOrRevGrowth;
  } else {
    arGrowth = prevArOrGrowth > 0 ? (latestArOrRevGrowth - prevArOrGrowth) / prevArOrGrowth : 0;
    revGrowth = prevRev > 0 ? (latestRev - prevRev) / prevRev : 0;
  }

  let arDivergenceDisplay = "";
  let arDivergenceStatus: ArDivergenceStatus = "NORMAL";
  let arDivergenceDesc = "";
  let ratio: number | null = null;

  if (arGrowth <= 0) {
    // Piutang menyusut = Kas masuk lebih cepat (Sangat Positif / Inflow)
    arDivergenceDisplay = `${(arGrowth * 100).toFixed(1)}% (Inflow)`;
    arDivergenceStatus = "EXCELLENT";
    arDivergenceDesc = `Koleksi kas prima: Piutang menyusut ${(Math.abs(arGrowth) * 100).toFixed(1)}% saat pendapatan ${(revGrowth * 100).toFixed(1)}%. Optimal Cash Inflow / Collection.`;
    ratio = null;
  } else if (revGrowth <= 0 && arGrowth > 0) {
    arDivergenceDisplay = `>3.0x (Divergen)`;
    arDivergenceStatus = "CRITICAL";
    arDivergenceDesc = `Peringatan: Piutang naik saat pendapatan turun. Risiko pengakuan pendapatan agresif.`;
    ratio = 3.0;
  } else {
    const rawRatio = revGrowth !== 0 ? arGrowth / revGrowth : 1.0;
    ratio = Number(rawRatio.toFixed(2));
    arDivergenceDisplay = `${ratio.toFixed(2)}x`;
    arDivergenceStatus = ratio > 1.5 ? "WARNING" : "NORMAL";
    arDivergenceDesc =
      ratio > 1.5
        ? `Pertumbuhan piutang melampaui pendapatan (>1.5x).`
        : `Pertumbuhan piutang selaras dengan pertumbuhan pendapatan.`;
  }

  return {
    arGrowth,
    revGrowth,
    ratio,
    display: arDivergenceDisplay,
    status: arDivergenceStatus,
    description: arDivergenceDesc,
  };
}
