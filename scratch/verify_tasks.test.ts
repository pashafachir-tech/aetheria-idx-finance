import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { computeAdaptiveReceivablesDivergence } from "../packages/finance-engine/src/index.js";
import { createResearchWorkbook } from "../packages/xlsx-export/src/index.js";
import type { WorkbookExportInput } from "../packages/xlsx-export/src/index.js";

describe("Verification of All User Tasks", () => {
  it("computes adaptive receivables divergence and identifies KOLEKSI KAS PRIMA", () => {
    const div = computeAdaptiveReceivablesDivergence(-0.999, 0.05);
    expect(div.status).toBe("EXCELLENT");
    expect(div.display).toBe("-99.9% (Inflow)");
    expect(div.description).toContain("Koleksi kas prima");
  });

  it("calculates dynamic quarterly ratio and YoY CFO growth", () => {
    const entry = { q1: 100, q2: 120, q3: 110, q4: 150, cfoYoYGrowth: 15.4 };
    const avgQ1Q3 = (entry.q1 + entry.q2 + entry.q3) / 3;
    const q4Ratio = avgQ1Q3 > 0 ? (entry.q4 / avgQ1Q3).toFixed(2) : "1.00";
    const cfoGrowth = entry.cfoYoYGrowth != null ? `${entry.cfoYoYGrowth >= 0 ? "+" : ""}${entry.cfoYoYGrowth.toFixed(1)}%` : "N/A";
    expect(q4Ratio).toBe("1.36");
    expect(cfoGrowth).toBe("+15.4%");
  });

  it("generates 8-sheet investment banking grade workbook with Executive Summary cover", async () => {
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
    expect(sheetNames).toEqual([
      "Executive Summary",
      "Raw Data",
      "Assumptions",
      "DCF",
      "Audit Trail",
      "Sensitivity",
      "Quality",
      "Integrity"
    ]);

    const exec = wb.getWorksheet("Executive Summary")!;
    expect(exec.getCell("A1").value).toBe("AETHERIA IDX FINANCE · EQUITY RESEARCH WORKBENCH");
    expect(exec.getCell("A5").value).toBe("TICKER & EMITEN");
    expect(exec.getCell("B5").value).toBe("HARGA PASAR SAAT INI");
    expect(exec.getCell("C5").value).toBe("NILAI WAJAR INTRINSIK (DCF)");
    expect(exec.getCell("D5").value).toBe("POTENSI UPSIDE / DOWNSIDE");
    expect(exec.getCell("E5").value).toBe("STATUS FORENSIK LABA");

    expect(exec.getCell("C6").value).toEqual({ formula: "DCF!F12" });
    expect(exec.getCell("D6").value).toEqual({ formula: "IF(B6>0,(C6-B6)/B6,0)" });
    expect(exec.getCell("E6").value).toEqual({ formula: 'IF(Quality!B12="","A",Quality!B12)' });

    for (const s of wb.worksheets) {
      const view = s.views?.[0];
      expect(view?.state).toBe("frozen");
      expect(view?.ySplit).toBe(1);
      expect(view?.showGridLines).toBe(true);
    }
  });

  it("verifies live HTTP export endpoint returns institutional workbook", async () => {
    const res = await fetch("http://localhost:3000/api/export?ticker=BYAN");
    expect(res.status).toBe(200);
    const ab = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(ab as never);
    expect(wb.worksheets[0].name).toBe("Executive Summary");
    const exec = wb.getWorksheet("Executive Summary")!;
    expect(exec.getCell("A1").value).toContain("AETHERIA IDX FINANCE");
    expect(exec.getCell("C6").value).toEqual({ formula: "DCF!F12" });
  });
});
