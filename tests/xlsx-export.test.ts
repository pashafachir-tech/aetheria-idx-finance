import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { createResearchWorkbook, type WorkbookExportInput } from "../packages/xlsx-export/src/index.js";
import type { AnnualFinancialStatement, EvidenceRef, MarketSnapshot } from "../packages/domain/src/index.js";

const evidence: EvidenceRef = { id: "sectors:financials:AKRA:2024", provider: "sectors", operation: "getFinancialStatements", retrievedAt: "2026-09-19T00:00:00.000Z", cacheStatus: "hit" };
const evidenced = (value: number) => ({ value, evidence, sourceCurrency: "IDR", periodEnd: "2024-12-31", originalPrecision: 0 });
const statement: AnnualFinancialStatement = {
  fiscalYear: 2024, periodEnd: "2024-12-31", currency: "IDR", revenue: evidenced(46_750), netIncome: evidenced(2_450), operatingCashFlow: evidenced(1_950), accountsReceivable: evidenced(4_650), ebit: evidenced(3_375), depreciationAndAmortization: evidenced(430), capitalExpenditure: evidenced(550), changeInNwc: evidenced(210),
};
const market: MarketSnapshot = { ticker: { value: "AKRA", evidence }, asOf: "2026-09-18", lastPrice: evidenced(1_525), sharesOutstanding: evidenced(20_000), currency: "IDR" };
const input: WorkbookExportInput = {
  ticker: "AKRA", financials: [statement], market,
  assumptions: { forecastFcff: [100, 110, 120, 130, 140], wacc: 0.12, terminalGrowth: 0.04, taxRate: 0.22, haircut: 0.15, cash: 50, totalDebt: 20, minorityInterest: 0, sharesOutstanding: 10 },
  analystDecision: { action: "apply", finalHaircut: 0.15, decidedAt: "2026-09-19T10:00:00.000Z" }, evidence: [evidence], auditTrail: [{ timestamp: "2026-09-19T10:00:00.000Z", state: "valuing", detail: "Analyst applied haircut" }],
};

describe("createResearchWorkbook", () => {
  it("creates the prescribed audit sheets and live DCF formulas", async () => {
    const buffer = await createResearchWorkbook(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Raw Data", "Assumptions", "DCF", "Audit Trail"]);
    expect(workbook.getWorksheet("Raw Data")!.getCell("D2").value).toBe(46_750);
    expect(workbook.getWorksheet("Raw Data")!.getCell("F2").value).toBe(evidence.id);
    const dcf = workbook.getWorksheet("DCF")!;
    expect(dcf.getCell("B4").value).toEqual({ formula: "B3*(1-Assumptions!$B$5)" });
    expect(dcf.getCell("F10").value).toEqual({ formula: "SUM(B5:F5)+F8" });
    expect(dcf.getCell("F12").value).toEqual({ formula: "F11/Assumptions!$B$9" });
  });

  it("refuses to export when the workbook haircut disagrees with the analyst decision", async () => {
    await expect(createResearchWorkbook({ ...input, assumptions: { ...input.assumptions, haircut: 0.3 } })).rejects.toThrow(/finalHaircut/);
  });
});
