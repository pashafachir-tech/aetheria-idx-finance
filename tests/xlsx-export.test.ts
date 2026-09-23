import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { createResearchWorkbook, type WorkbookExportInput } from "../packages/xlsx-export/src/index.js";
import { calculateDcf, calculateFcff, computeEarningsQualityScorecard } from "../packages/finance-engine/src/index.js";
import type { AnnualFinancialStatement, EvidenceRef, MarketSnapshot } from "../packages/domain/src/index.js";
import financialsFixture from "../fixtures/akra/financial-statements.json";

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

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Executive Summary", "Raw Data", "Assumptions", "DCF", "Audit Trail", "Sensitivity", "Quality", "Integrity"]);
    expect(workbook.getWorksheet("Executive Summary")!.getCell("A1").value).toContain("AETHERIA IDX FINANCE");
    expect(workbook.getWorksheet("Executive Summary")!.getCell("C6").value).toEqual({ formula: "DCF!F12" });
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

  it("adds a live Sensitivity sheet whose baseline cell mirrors the DCF fair value", async () => {
    const latest = financialsFixture.data[1];
    const base = calculateFcff({ ebit: latest.ebit, taxRate: 0.22, depreciationAndAmortization: latest.depreciation_and_amortization, capitalExpenditure: latest.capital_expenditure, changeInNwc: latest.change_in_nwc });
    if (base.status !== "ok") throw new Error("Expected a base FCFF result");
    const forecastFcff = Array.from({ length: 5 }, (_, index) => base.value * 1.05 ** (index + 1));
    const akraAssumptions = { forecastFcff, wacc: 0.12, terminalGrowth: 0.04, taxRate: 0.22, haircut: 0.15, cash: 4_100_000_000_000, totalDebt: 11_800_000_000_000, minorityInterest: 0, sharesOutstanding: 20_000_000_000 };

    const buffer = await createResearchWorkbook({ ...input, assumptions: akraAssumptions, analystDecision: { action: "apply", finalHaircut: 0.15, decidedAt: "2026-09-19T10:00:00.000Z" } });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    const sheet = workbook.getWorksheet("Sensitivity")!;
    expect(sheet.getCell("B2").value).toBe(0.08);
    expect(sheet.getCell("F2").value).toBe(0.12);
    expect(sheet.getCell("A3").value).toBe(0.01);
    expect(sheet.getCell("A7").value).toBe(0.05);
    const baseline = sheet.getCell("F6");
    expect(baseline.value).toMatchObject({ formula: expect.stringContaining("Assumptions!$B$9") });
    expect(baseline.fill).toMatchObject({ type: "pattern", fgColor: { argb: "FFD1FAE5" } });
    expect(sheet.getCell("D9").value).toEqual({ formula: "DCF!$F$12" });

    const dcf = calculateDcf({ ...akraAssumptions, forecastFcff: forecastFcff.map((value) => value * 0.85) });
    expect(dcf.status).toBe("ok");
    if (dcf.status === "ok") expect(dcf.value.fairValuePerShare).toBeCloseTo(941.109455, 3);
  });

  it("adds a live Quality sheet whose formulas reconcile to the engine scorecard", async () => {
    const periods = financialsFixture.data.map((statement) => ({
      periodEnd: statement.period_end,
      netIncome: statement.net_income,
      operatingCashFlow: statement.operating_cash_flow,
      revenue: statement.revenue,
      accountsReceivable: statement.accounts_receivable,
    }));
    const scorecard = computeEarningsQualityScorecard(periods, { sector: "Energy" });
    expect(scorecard.status).toBe("ok");
    if (scorecard.status !== "ok") throw new Error("Expected a scorecard result");
    expect(scorecard.value.score).toBe(66);
    expect(scorecard.value.grade).toBe("C");

    const ev = (value: number, periodEnd: string) => ({ value, evidence, sourceCurrency: "IDR", periodEnd, originalPrecision: 0 });
    const periodStatements: AnnualFinancialStatement[] = financialsFixture.data.map((statement) => ({
      fiscalYear: statement.fiscal_year,
      periodEnd: statement.period_end,
      currency: statement.currency,
      revenue: ev(statement.revenue, statement.period_end),
      netIncome: ev(statement.net_income, statement.period_end),
      operatingCashFlow: ev(statement.operating_cash_flow, statement.period_end),
      accountsReceivable: ev(statement.accounts_receivable, statement.period_end),
      ebit: ev(statement.ebit, statement.period_end),
      depreciationAndAmortization: ev(statement.depreciation_and_amortization, statement.period_end),
      capitalExpenditure: ev(statement.capital_expenditure, statement.period_end),
      changeInNwc: ev(statement.change_in_nwc, statement.period_end),
    }));
    const latest = financialsFixture.data[1];
    const base = calculateFcff({ ebit: latest.ebit, taxRate: 0.22, depreciationAndAmortization: latest.depreciation_and_amortization, capitalExpenditure: latest.capital_expenditure, changeInNwc: latest.change_in_nwc });
    if (base.status !== "ok") throw new Error("Expected a base FCFF result");
    const forecastFcff = Array.from({ length: 5 }, (_, index) => base.value * 1.05 ** (index + 1));
    const assumptions = { forecastFcff, wacc: 0.12, terminalGrowth: 0.04, taxRate: 0.22, haircut: 0.15, cash: 4_100_000_000_000, totalDebt: 11_800_000_000_000, minorityInterest: 0, sharesOutstanding: 20_000_000_000 };

    const buffer = await createResearchWorkbook({ ...input, financials: periodStatements, assumptions, analystDecision: { action: "apply", finalHaircut: 0.15, decidedAt: "2026-09-19T10:00:00.000Z" }, qualityScorecard: scorecard.value });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Executive Summary", "Raw Data", "Assumptions", "DCF", "Audit Trail", "Sensitivity", "Quality", "Integrity"]);
    const quality = workbook.getWorksheet("Quality")!;
    expect(quality.getCell("A3").value).toMatchObject({ formula: "'Raw Data'!B2" });
    expect(quality.getCell("B4").value).toMatchObject({ formula: expect.stringContaining("'Raw Data'!D11") });
    expect(quality.getCell("B11").value).toMatchObject({ formula: expect.stringContaining("ROUND(") });
    expect(quality.getCell("B12").value).toMatchObject({ formula: expect.stringContaining("IF(") });
  });

  async function buildIntegrityWorkbook(overrides: Partial<WorkbookExportInput> = {}) {
    const buffer = await createResearchWorkbook({ ...input, runId: "run-123", ...overrides });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    return workbook;
  }

  it("exports the eight-sheet institutional workbook including Executive Summary and Integrity", async () => {
    const workbook = await buildIntegrityWorkbook();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Executive Summary", "Raw Data", "Assumptions", "DCF", "Audit Trail", "Sensitivity", "Quality", "Integrity"]);
    expect(workbook.getWorksheet("Executive Summary")!.getCell("A1").value).toContain("AETHERIA IDX FINANCE");
    expect(workbook.getWorksheet("Integrity")!.getCell("A1").value).toContain("MODEL INTEGRITY");
  });

  it("wires the Integrity audit formulas to the canonical workbook cells", async () => {
    const workbook = await buildIntegrityWorkbook();
    const integrity = workbook.getWorksheet("Integrity")!;
    const formulas = [5, 6, 7, 8, 9].map((row) => String((integrity.getCell(row, 3).value as { formula?: string }).formula ?? ""));
    expect(formulas.some((formula) => formula.includes("Assumptions!B5"))).toBe(true);
    expect(formulas.some((formula) => formula.includes("Assumptions!B8"))).toBe(true);
    expect(formulas.some((formula) => formula.includes("Assumptions!B9"))).toBe(true);
    expect(formulas.some((formula) => formula.includes("DCF!F12"))).toBe(true);
    expect(formulas.some((formula) => formula.includes("Sensitivity!B6"))).toBe(true);
  });

  it("summarizes the integrity audit with a COUNTIF guard in B11", async () => {
    const workbook = await buildIntegrityWorkbook();
    const summary = workbook.getWorksheet("Integrity")!.getCell("B11").value as { formula?: string };
    expect(summary.formula).toContain("COUNTIF(C5:C9");
    expect(summary.formula).toContain("ALL 5 INVARIANTS SATISFIED");
  });

  it("tags every invariant row with an expected PASSED status and a live status formula", async () => {
    const workbook = await buildIntegrityWorkbook();
    const integrity = workbook.getWorksheet("Integrity")!;
    for (let row = 5; row <= 9; row += 1) {
      expect(integrity.getCell(row, 4).value).toBe("PASSED");
      expect(integrity.getCell(row, 3).value).toMatchObject({ formula: expect.stringContaining("IF(") });
    }
  });

  it("keeps the haircut parity guard aligned with the recorded analyst decision", async () => {
    const workbook = await buildIntegrityWorkbook({
      assumptions: { ...input.assumptions, haircut: 0.2 },
      analystDecision: { action: "edit", finalHaircut: 0.2, decidedAt: "2026-09-19T10:00:00.000Z" },
    });
    const formula = (workbook.getWorksheet("Integrity")!.getCell("C5").value as { formula?: string }).formula ?? "";
    expect(formula).toContain("Assumptions!B5-0.2");
  });
});
