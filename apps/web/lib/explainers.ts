export interface Explainer {
  label: string;
  definition: string;
  analogy: string;
}

export const EXPLAINERS = {
  divergence: { label: "Divergensi Piutang", definition: "Seberapa cepat piutang tumbuh dibandingkan pendapatan penjualan.", analogy: "Seperti jualan laris di pembukuan tapi pembeli banyak yang ngutang." },
  cfoNi: { label: "Konversi Kas CFO/NI", definition: "Berapa banyak laba bersih yang benar-benar berubah menjadi kas operasi.", analogy: "Seperti gaji yang sudah masuk rekening, bukan sekadar janji bonus." },
  workingCapitalDrag: { label: "Working Capital Drag", definition: "Kas yang terserap modal kerja (piutang/persediaan) sebelum menjadi arus kas operasi.", analogy: "Seperti uang yang dipakai kulakan lebih dulu sebelum dagangan terjual." },
  residual: { label: "Unexplained Working Capital Residual", definition: "Selisih tak terjelaskan antara laba, D&A, dan modal kerja terhadap arus kas operasi yang dilaporkan.", analogy: "Seperti sisa uang di dompet yang tidak jelas dipakai untuk apa." },
  dso: { label: "DSO (Days Sales Outstanding)", definition: "Rata-rata jumlah hari untuk menagih piutang penjualan.", analogy: "Seperti berapa lama pelanggan membayar utang belanjanya." },
  reverseDcf: { label: "Reverse DCF / Expectation Gap", definition: "Pertumbuhan yang secara implisit dihargai pasar dibanding pertumbuhan historis.", analogy: "Seperti menebak seberapa optimistis pembeli menilai prospek toko." },
  wacc: { label: "WACC / Terminal Growth", definition: "Tingkat diskonto modal dan asumsi pertumbuhan abadi dalam valuasi.", analogy: "Seperti bunga pinjaman dan target pertumbuhan usaha jangka panjang." },
  haircut: { label: "Cash Haircut", definition: "Pemotongan proyeksi arus kas oleh analis untuk berjaga-jaga.", analogy: "Seperti menyisihkan sebagian anggaran untuk dana darurat." },
  bookValue: { label: "Book Value / Share", definition: "Nilai ekuitas per lembar saham menurut neraca.", analogy: "Seperti nilai barang yang benar-benar dimiliki dibagi jumlah pemilik." },
  roe: { label: "ROE", definition: "Laba bersih dibagi ekuitas; seberapa efisien modal menghasilkan laba.", analogy: "Seperti seberapa besar untung dari modal yang ditanam." },
  coe: { label: "Cost of Equity", definition: "Imbal hasil minimum yang diminta pemegang saham.", analogy: "Seperti target untung minimum agar investasi terasa layak." },
  nim: { label: "NIM (Net Interest Margin)", definition: "Selisih bunga kredit dan bunga simpanan relatif aset produktif bank.", analogy: "Seperti margin antara harga jual dan harga kulakan bank." },
  npl: { label: "NPL (Non-Performing Loan)", definition: "Persentase kredit bermasalah terhadap total kredit.", analogy: "Seperti berapa banyak pinjaman yang telat bayar." },
  flow: { label: "Net Foreign Flow", definition: "Akumulasi arus beli bersih atau jual bersih oleh pemodal asing di Bursa Efek Indonesia.", analogy: "Seperti mencatat apakah modal asing sedang mengakumulasi atau mendistribusikan saham di pasar." },
} as const;

export type ExplainerKey = keyof typeof EXPLAINERS;

export function explainerKeys(): ExplainerKey[] {
  return Object.keys(EXPLAINERS) as ExplainerKey[];
}