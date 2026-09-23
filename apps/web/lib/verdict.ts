export type Verdict = "aman" | "waspada" | "risiko";

export interface VerdictInput {
  cfoNi: number | null;
  divergence: number | null;
  fairValueAboveMarket: boolean | null;
  grade: "A" | "B" | "C" | "D" | null;
}

export interface VerdictResult {
  verdict: Verdict;
  emoji: string;
  label: string;
  reasons: string[];
}

export function computeFinancialVerdict(input: VerdictInput): VerdictResult {
  const { cfoNi, divergence, grade } = input;
  const weakCash = cfoNi != null && (cfoNi < 0.5 || cfoNi < 0);
  const breachedCash = cfoNi != null && cfoNi < 0.75;
  const severeDivergence = divergence != null && (divergence > 3 || divergence < 0);
  const strongCash = cfoNi != null && cfoNi > 0.85;
  const balancedReceivables = divergence != null && divergence >= 0 && divergence < 1.4;

  let verdict: Verdict;
  if (weakCash || severeDivergence || grade === "D") verdict = "risiko";
  else if (breachedCash || (divergence != null && (divergence < 0 || divergence > 1.4)) || grade === "C") verdict = "waspada";
  else if (strongCash && balancedReceivables) verdict = "aman";
  else verdict = "waspada";

  const reasons: string[] = [];
  reasons.push(
    cfoNi != null
      ? `Konversi kas CFO/NI ${cfoNi.toFixed(2)}x — ${cfoNi < 0 ? "arus kas operasional defisit" : cfoNi < 0.75 ? "konversi kas bocor / di bawah batas aman 0.75x" : cfoNi > 0.85 ? "laba didukung kas riil" : "sebagian laba tertahan di modal kerja"}.`
      : "Konversi kas CFO/NI belum dapat dievaluasi karena data tidak lengkap.",
  );
  reasons.push(
    divergence != null
      ? `Divergensi piutang ${divergence.toFixed(2)}x — ${divergence < 0 ? "anomali fluktuasi/distorsi piutang negatif tajam" : divergence >= 1.5 ? "piutang tumbuh lebih cepat dari pendapatan" : "berada dalam batas wajar"}.`
      : "Divergensi piutang belum dapat dievaluasi.",
  );
  reasons.push(
    grade != null
      ? `Kualitas laba Grade ${grade} — ${grade === "C" || grade === "D" ? "perlu pengawasan akrual" : "terjaga"}.`
      : "Skor kualitas laba belum tersedia.",
  );

  const meta = verdict === "aman" ? { emoji: "🟢", label: "AMAN" } : verdict === "waspada" ? { emoji: "🟡", label: "WASPADA" } : { emoji: "🔴", label: "RISIKO TINGGI" };
  return { verdict, ...meta, reasons: reasons.slice(0, 3) };
}