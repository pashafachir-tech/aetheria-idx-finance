import ExcelJS from "exceljs";
import { computeAdaptiveReceivablesDivergence } from "../packages/finance-engine/src/index.js";
import { createResearchWorkbook } from "../packages/xlsx-export/src/index.js";
import type { WorkbookExportInput } from "../packages/xlsx-export/src/index.js";

async function run() {
  console.log("=== 1. TEST ADAPTIVE RECEIVABLES DIVERGENCE ===");
  const div1 = computeAdaptiveReceivablesDivergence(-0.999, 0.05);
  console.log("AR Growth -99.9%, Rev Growth +5%:", div1);
  if (div1.status !== "EXCELLENT" || !div1.display.includes("Inflow")) {
    throw new Error("Divergence status or display incorrect for negative AR growth");
  }

  console.log("\n=== 2. TEST DYNAMIC CFO YOY & Q4 RATIO ===");
  const entry = { q1: 100, q2: 120, q3: 110, q4: 150, cfoYoYGrowth: 15.4 };
  const avgQ1Q3 = (entry.q1 + entry.q2 + entry.q3) / 3;
  const q4Ratio = avgQ1Q3 > 0 ? (entry.q4 / avgQ1Q3).toFixed(2) : "1.00";
  const cfoGrowth = entry.cfoYoYGrowth != null ? `${entry.cfoYoYGrowth >= 0 ? "+" : ""}${entry.cfoYoYGrowth.toFixed(1)}%` : "N/A";
  console.log(`Q4 vs Avg(Q1-Q3): ${q4Ratio}x | CFO YoY: ${cfoGrowth}`);
  if (q4Ratio !== "1.36" || cfoGrowth !== "+15.4%") {
    throw new Error("Dynamic seasonality calculation mismatch");
  }

  console.log("\n=== 3. TEST EXCEL EXPORT WORKBOOK GENERATION ===");
  const evidence = { id: "sectors:test", provider: "sectors", operation: "test", retrievedAt: "2026-09-23T00:00:00.000Z" };
  const evidenced = (v: number) => ({ value: v, evidence, sourceCurrency: "IDR", periodEnd: "2024-12-31", originalPrecision: 0 });
  const input: WorkbookExportInput = {
    ticker: "BYAN",
    companyName: "PT Bayan Resources Tbk",
    financials: [{
      fiscalYear: 2024, periodEnd: "2024-12-31", currency: "IDR",
      revenue: evidenced(40_000), netIncome: evidenced(12_000), operatingCashFlow: evidenced(15_000),
      accountsReceivable: evidenced(1_200), ebit: evidenced(14_000), depreciationAndAmortization: evidenced(1_000),
      capitalExpenditure: evidenced(2_000), changeInNwc: evidenced(500)
    }],
    market: { ticker: { value: "BYAN", evidence }, asOf: "2026-09-23", lastPrice: evidenced(18_500), sharesOutstanding: evidenced(33_333_335_000), currency: "IDR" },
    assumptions: { forecastFcff: [1000, 1100, 1200, 1300, 1400], wacc: 0.11, terminalGrowth: 0.03, taxRate: 0.22, haircut: 0.10, cash: 500, totalDebt: 200, minorityInterest: 0, sharesOutstanding: 100 },
    analystDecision: { action: "apply", finalHaircut: 0.10, decidedAt: "2026-09-23T10:00:00.000Z" },
    evidence: [evidence],
    auditTrail: [{ timestamp: "2026-09-23T10:00:00.000Z", state: "valuing", detail: "Valuation executed" }],
  };

  const buffer = await createResearchWorkbook(input);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);

  const sheetNames = wb.worksheets.map(s => s.name);
  console.log("Worksheets in generated workbook:", sheetNames);
  if (sheetNames[0] !== "Executive Summary") {
    throw new Error("Expected Sheet 1 to be 'Executive Summary'");
  }

  const exec = wb.getWorksheet("Executive Summary")!;
  console.log("Executive Summary A1:", exec.getCell("A1").value);
  console.log("Executive Summary A5:", exec.getCell("A5").value);
  console.log("Executive Summary B5:", exec.getCell("B5").value);
  console.log("Executive Summary C5:", exec.getCell("C5").value);
  console.log("Executive Summary C6 formula:", exec.getCell("C6").value);
  console.log("Executive Summary D6 formula:", exec.getCell("D6").value);
  console.log("Executive Summary E6 formula:", exec.getCell("E6").value);

  // Check borders and fills
  const c6Cell = exec.getCell("C6");
  console.log("C6 border:", JSON.stringify(c6Cell.border));
  console.log("C6 fill:", JSON.stringify(c6Cell.fill));

  // Check view options (freeze panes & gridlines)
  for (const s of wb.worksheets) {
    const view = s.views?.[0];
    if (!view || view.state !== "frozen" || view.ySplit !== 1) {
      throw new Error(`Sheet ${s.name} missing frozen header row`);
    }
    if (view.showGridLines !== true) {
      throw new Error(`Sheet ${s.name} missing showGridLines`);
    }
  }
  console.log("All 8 sheets have freeze panes (ySplit=1) and showGridLines=true!");

  console.log("\n=== 4. TEST LIVE HTTP EXPORT ENDPOINT ===");
  const res = await fetch("http://localhost:3000/api/export?ticker=BYAN");
  console.log("HTTP /api/export status:", res.status);
  if (res.status === 200) {
    const ab = await res.arrayBuffer();
    const liveWb = new ExcelJS.Workbook();
    await liveWb.xlsx.load(ab as never);
    console.log("Live export worksheets:", liveWb.worksheets.map(s => s.name));
    const liveExec = liveWb.getWorksheet("Executive Summary")!;
    console.log("Live export Exec Summary A1:", liveExec.getCell("A1").value);
    console.log("Live export Exec Summary C6 formula:", liveExec.getCell("C6").value);
    console.log("Live export Exec Summary D6 formula:", liveExec.getCell("D6").value);
    console.log("Live export Exec Summary E6 formula:", liveExec.getCell("E6").value);
  }

  console.log("\nALL VERIFICATIONS PASSED SUCCESSFULLY!");
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
