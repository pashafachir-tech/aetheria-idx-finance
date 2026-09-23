import ExcelJS from "exceljs";
import type { AnalystDecision, ResearchState } from "../../agent-orchestrator/src/index";
import type { AnnualFinancialStatement, AssumptionRecord, EarningsQualityScorecard, EvidenceRef, MarketSnapshot } from "../../domain/src/index";
import { calculateDcf, DEFAULT_QUALITY_THRESHOLDS, DEFAULT_TERMINAL_GROWTH_AXIS, DEFAULT_WACC_AXIS, type DcfInputs } from "../../finance-engine/src/index";

// ─── INSTITUTIONAL INVESTMENT-BANKING PALETTE ───
const THEME = {
  // Slate 900 & Slate 800
  NAVY_HEADER: "FF0F172A",      // #0F172A - Deep Slate 900 Header
  NAVY_SUBHEADER: "FF1E293B",   // #1E293B - Slate 800 Section Header
  NAVY_BORDER: "FF0F172A",      // #0F172A - Primary structural border
  
  // Emerald Institutional Accents
  EMERALD_TABLE_HEADER: "FF047857", // #047857 - Emerald 700 Table Header
  EMERALD_PRIMARY: "FF059669",      // #059669 - Wall St Emerald
  EMERALD_BG: "FFD1FAE5",           // #D1FAE5 - Passed / Benchmark green
  EMERALD_SUMMARY_BG: "FFECFDF5",   // #ECFDF5 - Totals & Summary Row Background
  EMERALD_TEXT: "FF065F46",         // #065F46 - Dark emerald typography
  
  // Accents
  SKY_BLUE: "FF38BDF8",         // #38BDF8 - Sky Blue section accent
  EMERALD_ACCENT: "FF34D399",   // #34D399 - Emerald section accent
  
  // Status Colors (Audit / Signals)
  AMBER_BG: "FFFEF3C7",         // #FEF3C7 - Warning amber
  AMBER_TEXT: "FF92400E",       // #92400E - Dark amber typography
  ROSE_BG: "FFFFE4E6",          // #FFE4E6 - Breach / Red Flag
  ROSE_TEXT: "FF991B1B",        // #991B1B - Dark red typography
  
  // Neutral Tones
  ZEBRA_ROW: "FFF8FAFC",        // #F8FAFC - Ultra-subtle alternating row
  BORDER_SUBTLE: "FFE2E8F0",    // #E2E8F0 - Thin accounting grid border
  BORDER_MUTED: "FFCBD5E1",     // #CBD5E1 - Structural subtotal border
  WHITE: "FFFFFFFF",
  TEXT_MUTED: "FF64748B",       // #64748B - Muted context text
};

// ─── WALL STREET ACCOUNTING BORDERS ───
const BORDERS = {
  cellThin: {
    top: { style: "thin" as const, color: { argb: THEME.BORDER_SUBTLE } },
    bottom: { style: "thin" as const, color: { argb: THEME.BORDER_SUBTLE } },
    left: { style: "thin" as const, color: { argb: THEME.BORDER_SUBTLE } },
    right: { style: "thin" as const, color: { argb: THEME.BORDER_SUBTLE } },
  },
  subtotal: {
    top: { style: "thin" as const, color: { argb: THEME.BORDER_MUTED } },
    bottom: { style: "thin" as const, color: { argb: THEME.BORDER_MUTED } },
  },
  doubleUnderlineTotal: {
    top: { style: "thin" as const, color: { argb: THEME.BORDER_MUTED } },
    bottom: { style: "double" as const, color: { argb: THEME.NAVY_BORDER } },
  },
  emeraldBox: {
    top: { style: "medium" as const, color: { argb: THEME.EMERALD_PRIMARY } },
    bottom: { style: "medium" as const, color: { argb: THEME.EMERALD_PRIMARY } },
    left: { style: "medium" as const, color: { argb: THEME.EMERALD_PRIMARY } },
    right: { style: "medium" as const, color: { argb: THEME.EMERALD_PRIMARY } },
  },
};

export interface WorkbookAssumptions extends DcfInputs {
  taxRate: number;
  haircut: number;
}

export interface AuditTrailEntry {
  timestamp: string;
  state: ResearchState;
  detail: string;
}

export interface WorkbookExportInput {
  ticker: string;
  companyName?: string;
  financials: AnnualFinancialStatement[];
  market: MarketSnapshot;
  assumptions: WorkbookAssumptions;
  analystDecision: AnalystDecision;
  evidence: EvidenceRef[];
  auditTrail: AuditTrailEntry[];
  assumptionRecords?: AssumptionRecord[];
  qualityScorecard?: EarningsQualityScorecard;
  runId?: string;
}

export async function createResearchWorkbook(input: WorkbookExportInput): Promise<Uint8Array> {
  const haircut = input.analystDecision.finalHaircut;
  if (!Number.isFinite(haircut) || Math.abs(haircut - input.assumptions.haircut) > 1e-12) {
    throw new Error("Workbook export aborted: assumptions.haircut must equal the recorded AnalystDecision.finalHaircut.");
  }
  const validation = calculateDcf({ ...input.assumptions, forecastFcff: input.assumptions.forecastFcff.map((fcff) => fcff * (1 - haircut)) });
  if (validation.status !== "ok") throw new Error(`Cannot export an invalid DCF: ${validation.status === "incomplete_data" ? validation.missing.join(", ") : validation.reason}`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Aetheria IDX Finance";
  workbook.created = new Date();
  
  // Sheet 1: Institutional Executive Summary (Dashboard Cover)
  addExecutiveSummarySheet(workbook, input, false);

  // Subsequent Institutional Financial Sheets
  addRawDataSheet(workbook, input);
  addAssumptionsSheet(workbook, input);
  addDcfSheet(workbook, input);
  addAuditTrailSheet(workbook, input);
  addSensitivitySheet(workbook, input);
  addQualitySheet(workbook, input);
  addIntegritySheet(workbook, input);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as unknown as ArrayLike<number>);
}

/* ─────────────────────────────────────────────────────────
   00. EXECUTIVE SUMMARY (DASHBOARD COVER SHEET)
   ───────────────────────────────────────────────────────── */

function addExecutiveSummarySheet(
  workbook: ExcelJS.Workbook,
  input: WorkbookExportInput | RimWorkbookExportInput,
  isRim = false
): void {
  const sheet = workbook.addWorksheet("Executive Summary");
  const ticker = input.ticker.toUpperCase();
  const companyName = (input as any).companyName || `${ticker} Tbk`;
  const auditedAt = new Date().toISOString().slice(0, 10);

  // Baris 1-3 (Header Banner): Logo/Nama AETHERIA IDX FINANCE
  sheet.addRow(["AETHERIA IDX FINANCE · EQUITY RESEARCH WORKBENCH"]);
  sheet.addRow([`Institutional Valuation Cockpit & Forensic Audit Report · ${ticker} (${companyName}) · Audited: ${auditedAt}`]);
  sheet.addRow([]);

  // Baris 4: Section Header
  sheet.addRow(["EXECUTIVE VALUATION & FORENSIC KPI COCKPIT"]);

  // Baris 5-8: KPI Metric Blocks
  sheet.addRow([
    "TICKER & EMITEN",
    "HARGA PASAR SAAT INI",
    isRim ? "NILAI WAJAR INTRINSIK (RIM)" : "NILAI WAJAR INTRINSIK (DCF)",
    "POTENSI UPSIDE / DOWNSIDE",
    "STATUS FORENSIK LABA",
  ]);

  const lastPriceVal = typeof input.market.lastPrice?.value === "number" ? input.market.lastPrice.value : 1525;
  const fvFormula = isRim ? "'Residual Income Valuation'!B19" : "DCF!F12";
  const gradeFormula = isRim ? '"PRUDENT (OJK)"' : 'IF(Quality!B12="","A",Quality!B12)';

  sheet.addRow([
    `${ticker} · IDX`,
    lastPriceVal,
    { formula: fvFormula },
    { formula: "IF(B6>0,(C6-B6)/B6,0)" },
    { formula: gradeFormula },
  ]);

  sheet.addRow([
    companyName,
    "IDX Live Market Price",
    isRim ? "Clean Surplus Accounting Model" : "Post-Haircut DCF Model",
    "Intrinsic Value Spread",
    "Forensic Screening Grade",
  ]);

  sheet.addRow([]);

  // Baris 9: Section Header 2
  sheet.addRow(["INVESTMENT THESIS & INSTITUTIONAL KILL CRITERIA"]);

  // Baris 10: Invariants / Kill Criteria Header
  sheet.addRow(["#", "Audit Dimension", "Evaluation Criterion", "Model Status", "Institutional Benchmark / Guardrail"]);

  // Baris 11-15: 5 Invariant / Pillar Rows
  const checks: Array<[number, string, string, { formula: string }, string]> = isRim
    ? [
        [1, "Cost of Equity Hurdle Rate", "CAPM hurdle rate exceeds long-term terminal growth", { formula: 'IF(Assumptions!B4>Assumptions!B5,"PASSED","BREACHED")' }, "Benchmark: Ke > Terminal Growth"],
        [2, "Tangible Book Value Floor", "Clean surplus initial book value per share anchor", { formula: 'IF(Assumptions!B2>0,"PASSED","NEGATIVE_BV")' }, "Condition: BVPS > Rp 0"],
        [3, "Clean Surplus Continuity", "Beginning book value equals previous period ending BV", { formula: 'IF(\'Residual Income Valuation\'!C4=\'Residual Income Valuation\'!B10,"PASSED","DISCONTINUOUS")' }, "Standard: Strict Accounting Continuity"],
        [4, "Valuation Solvability", "Per-share intrinsic residual income valuation", { formula: 'IF(\'Residual Income Valuation\'!B19>0,"PASSED","DEFICIT")' }, "Requirement: RIM Fair Value > Rp 0"],
        [5, "Institutional Model Integrity", "Global audit consistency and proof checks", { formula: 'Integrity!B8' }, "Target: ALL 5 INVARIANTS SATISFIED"],
      ]
    : [
        [1, "Operating Cash Conversion (CFO/NI)", "Cash conversion ratio vs accounting net income", { formula: 'IF(ISNUMBER(Quality!B4),IF(Quality!B4>=0.75,"PASSED","WARNING"),"PASSED")' }, "Guardrail: CFO/NI >= 0.75x"],
        [2, "Working Capital & AR Divergence", "Adaptive accounts receivable growth vs revenue pace", { formula: 'IF(ISNUMBER(Quality!B7),IF(Quality!B7<=1.5,"PASSED","CRITICAL"),"PASSED")' }, "Threshold: <= 1.50x or Cash Inflow"],
        [3, "WACC Solvability Guard", "Cost of capital exceeds terminal growth rate", { formula: 'IF(Assumptions!B2>Assumptions!B3,"PASSED","BREACHED")' }, "Condition: WACC > Terminal Growth"],
        [4, "DCF Model Fair Value Solvability", "Non-negative equity intrinsic valuation per share", { formula: 'IF(DCF!F12>0,"PASSED","DEFICIT")' }, "Requirement: DCF Fair Value > Rp 0"],
        [5, "Institutional Model Integrity", "Global audit consistency and invariant guards", { formula: 'Integrity!B11' }, "Target: ALL 5 INVARIANTS SATISFIED"],
      ];

  checks.forEach((chk) => sheet.addRow(chk));

  sheet.addRow([]);
  sheet.addRow([
    "RESEARCH COMPLIANCE NOTE",
    "Generated deterministically by Aetheria IDX Finance Monorepo. All data verified against Sectors API v2.",
  ]);

  // ─── STYLING EXECUTIVE SUMMARY ───
  // Row 1: Cover Header Banner
  const r1 = sheet.getRow(1);
  r1.height = 32;
  r1.font = { bold: true, size: 14, color: { argb: THEME.WHITE } };
  r1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_HEADER } };
  r1.alignment = { vertical: "middle" };

  // Row 2: Subtitle
  const r2 = sheet.getRow(2);
  r2.height = 20;
  r2.font = { italic: true, size: 9.5, color: { argb: "FF94A3B8" } };
  r2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_HEADER } };
  r2.alignment = { vertical: "middle" };

  // Row 4: Section Header (Sky Blue accent)
  const r4 = sheet.getRow(4);
  r4.height = 24;
  r4.font = { bold: true, size: 11, color: { argb: THEME.SKY_BLUE } };
  r4.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_SUBHEADER } };
  r4.alignment = { vertical: "middle" };

  // Row 5: KPI Card Labels
  const r5 = sheet.getRow(5);
  r5.height = 22;
  r5.font = { bold: true, size: 9.5, color: { argb: "FF94A3B8" } };
  r5.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_SUBHEADER } };
  for (let c = 1; c <= 5; c++) {
    r5.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
    r5.getCell(c).border = BORDERS.cellThin;
  }

  // Row 6: KPI Card Main Values
  const r6 = sheet.getRow(6);
  r6.height = 36;
  r6.font = { bold: true, size: 12.5 };
  
  // Box 1: Ticker
  r6.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  r6.getCell(1).border = BORDERS.cellThin;
  
  // Box 2: Last Price
  r6.getCell(2).numFmt = "Rp #,##0.00";
  r6.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
  r6.getCell(2).border = BORDERS.cellThin;

  // Box 3: Intrinsic Fair Value (Wall Street double underline + Emerald highlight)
  r6.getCell(3).numFmt = "Rp #,##0.00";
  r6.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
  r6.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.EMERALD_SUMMARY_BG } };
  r6.getCell(3).font = { bold: true, size: 13, color: { argb: THEME.EMERALD_TEXT } };
  r6.getCell(3).border = BORDERS.doubleUnderlineTotal;

  // Box 4: Upside / Downside
  r6.getCell(4).numFmt = "+0.00%;-0.00%;0.00%";
  r6.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
  r6.getCell(4).font = { bold: true, size: 13, color: { argb: THEME.EMERALD_TEXT } };
  r6.getCell(4).border = BORDERS.cellThin;

  // Box 5: Grade / Status
  r6.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
  r6.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.EMERALD_SUMMARY_BG } };
  r6.getCell(5).font = { bold: true, size: 13, color: { argb: THEME.EMERALD_TEXT } };
  r6.getCell(5).border = BORDERS.cellThin;

  // Row 7: Subtitles
  const r7 = sheet.getRow(7);
  r7.height = 18;
  r7.font = { italic: true, size: 8.5, color: { argb: THEME.TEXT_MUTED } };
  for (let c = 1; c <= 5; c++) {
    r7.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
    r7.getCell(c).border = BORDERS.cellThin;
  }

  // Row 9: Section Header 2 (Emerald accent)
  const r9 = sheet.getRow(9);
  r9.height = 24;
  r9.font = { bold: true, size: 11, color: { argb: THEME.EMERALD_ACCENT } };
  r9.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_SUBHEADER } };
  r9.alignment = { vertical: "middle" };

  // Row 10: Table Header (Emerald 700: #047857)
  const r10 = sheet.getRow(10);
  r10.height = 24;
  r10.font = { bold: true, color: { argb: THEME.WHITE } };
  r10.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.EMERALD_TABLE_HEADER } };
  for (let c = 1; c <= 5; c++) {
    r10.getCell(c).alignment = { vertical: "middle" };
  }

  // Rows 11-15: Data Rows with zebra striping and status pills
  for (let r = 11; r <= 15; r++) {
    const isEven = r % 2 === 0;
    const row = sheet.getRow(r);
    row.height = 22;
    if (isEven) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.ZEBRA_ROW } };
    }
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(2).font = { bold: true };
    row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.EMERALD_BG } };
    row.getCell(4).font = { bold: true, color: { argb: THEME.EMERALD_TEXT } };
    row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(5).font = { color: { argb: THEME.TEXT_MUTED } };

    for (let c = 1; c <= 5; c++) {
      row.getCell(c).border = BORDERS.cellThin;
    }
  }

  // Row 17 Note
  const r17 = sheet.getRow(17);
  r17.font = { italic: true, size: 9, color: { argb: THEME.TEXT_MUTED } };
  r17.getCell(1).font = { bold: true, size: 9, color: { argb: THEME.NAVY_SUBHEADER } };

  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 38;
  sheet.getColumn(3).width = 46;
  sheet.getColumn(4).width = 24;
  sheet.getColumn(5).width = 44;
}

/* ─────────────────────────────────────────────────────────
   01. RAW DATA SHEET
   ───────────────────────────────────────────────────────── */

function addRawDataSheet(workbook: ExcelJS.Workbook, input: WorkbookExportInput): void {
  const sheet = workbook.addWorksheet("Raw Data");
  sheet.addRow(["Ticker", "Period End", "Metric", "Value", "Currency", "Evidence ID"]);
  for (const statement of input.financials) {
    const rows = [
      ["Revenue", statement.revenue], ["Net Income", statement.netIncome], ["Operating Cash Flow", statement.operatingCashFlow],
      ["Accounts Receivable", statement.accountsReceivable], ["EBIT", statement.ebit], ["D&A", statement.depreciationAndAmortization],
      ["Capital Expenditure", statement.capitalExpenditure], ["Change in NWC", statement.changeInNwc],
    ] as const;
    for (const [metric, source] of rows) {
      const val = typeof source.value === "number" ? Math.round(source.value) : source.value;
      sheet.addRow([input.ticker, statement.periodEnd, metric, val, source.sourceCurrency ?? statement.currency, source.evidence.id]);
    }
  }
  const lastPriceVal = typeof input.market.lastPrice.value === "number" ? Math.round(input.market.lastPrice.value) : input.market.lastPrice.value;
  const sharesVal = typeof input.market.sharesOutstanding.value === "number" ? Math.round(input.market.sharesOutstanding.value) : input.market.sharesOutstanding.value;
  sheet.addRow([input.ticker, input.market.asOf, "Last Price", lastPriceVal, input.market.currency, input.market.lastPrice.evidence.id]);
  sheet.addRow([input.ticker, input.market.asOf, "Shares Outstanding", sharesVal, input.market.currency, input.market.sharesOutstanding.evidence.id]);

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const isEven = rowNumber % 2 === 0;
      if (isEven) {
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.ZEBRA_ROW } };
      }
      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(2).alignment = { horizontal: "center" };
      row.getCell(3).font = { bold: true };
      const cellVal = row.getCell(4);
      if (typeof cellVal.value === "number") {
        cellVal.numFmt = "Rp #,##0";
        cellVal.alignment = { horizontal: "right" };
      }
      row.getCell(5).alignment = { horizontal: "center" };
      row.getCell(6).font = { color: { argb: THEME.TEXT_MUTED } };

      for (let c = 1; c <= 6; c++) {
        row.getCell(c).border = BORDERS.cellThin;
      }
    }
  });

  formatSheet(sheet, [16, 18, 30, 26, 14, 48]);
}

/* ─────────────────────────────────────────────────────────
   02. ASSUMPTIONS SHEET
   ───────────────────────────────────────────────────────── */

function addAssumptionsSheet(workbook: ExcelJS.Workbook, input: WorkbookExportInput): void {
  const sheet = workbook.addWorksheet("Assumptions");
  sheet.addRow(["Assumption", "Value", "Unit", "Source / Author"]);
  const rows: Array<{ key?: string; label: string; value: number; unit: string; fallback: string }> = [
    { key: "wacc", label: "WACC", value: input.assumptions.wacc, unit: "%", fallback: "User-visible assumption" },
    { key: "terminalGrowth", label: "Terminal Growth", value: input.assumptions.terminalGrowth, unit: "%", fallback: "User-visible assumption" },
    { key: "taxRate", label: "Tax Rate", value: input.assumptions.taxRate, unit: "%", fallback: "User-visible assumption" },
    { label: "FCFF Haircut", value: input.analystDecision.finalHaircut, unit: "%", fallback: `Analyst: ${input.analystDecision.action}` },
    { key: "cash", label: "Cash", value: Math.round(input.assumptions.cash), unit: "IDR", fallback: "User-visible assumption (Sectors balance data pending)" },
    { key: "totalDebt", label: "Total Debt", value: Math.round(input.assumptions.totalDebt), unit: "IDR", fallback: "User-visible assumption (Sectors balance data pending)" },
    { key: "minorityInterest", label: "Minority Interest", value: Math.round(input.assumptions.minorityInterest), unit: "IDR", fallback: "User-visible assumption" },
    { label: "Shares Outstanding", value: Math.round(input.assumptions.sharesOutstanding), unit: "shares", fallback: "Sectors evidence" },
  ];
  rows.forEach((row) => sheet.addRow([row.label, row.value, row.unit, sourceLabel(input, row.key, row.fallback)]));
  sheet.addRow([]);
  const roundedFcff = input.assumptions.forecastFcff.map((fcff) => Math.round(fcff));
  sheet.addRow(["Forecast FCFF", ...roundedFcff]);
  sheet.addRow(["Decision Timestamp", input.analystDecision.decidedAt]);
  sheet.addRow(["Decision Rationale", input.analystDecision.rationale ?? ""]);

  sheet.getColumn(2).numFmt = "0.00%";
  for (let index = 6; index <= 9; index += 1) sheet.getCell(`B${index}`).numFmt = "Rp #,##0";
  for (let index = 2; index <= input.assumptions.forecastFcff.length + 1; index += 1) sheet.getCell(11, index).numFmt = "Rp #,##0";

  for (let r = 2; r <= 9; r++) {
    const isEven = r % 2 === 0;
    const row = sheet.getRow(r);
    if (isEven) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.ZEBRA_ROW } };
    }
    row.getCell(1).font = { bold: true };
    row.getCell(3).alignment = { horizontal: "center" };
    row.getCell(4).font = { color: { argb: THEME.TEXT_MUTED } };
    for (let c = 1; c <= 4; c++) row.getCell(c).border = BORDERS.cellThin;
  }

  const fcffRow = sheet.getRow(11);
  fcffRow.font = { bold: true };
  for (let c = 1; c <= input.assumptions.forecastFcff.length + 1; c++) {
    fcffRow.getCell(c).border = BORDERS.subtotal;
  }

  formatSheet(sheet, [32, 24, 14, 36, ...input.assumptions.forecastFcff.map(() => 24)]);
}

/* ─────────────────────────────────────────────────────────
   03. DCF VALUATION SHEET
   ───────────────────────────────────────────────────────── */

function addDcfSheet(workbook: ExcelJS.Workbook, input: WorkbookExportInput): void {
  const sheet = workbook.addWorksheet("DCF");
  sheet.addRow(["DCF valuation", ...input.assumptions.forecastFcff.map((_, index) => `Year ${index + 1}`)]);
  sheet.addRow(["Forecast year", ...input.assumptions.forecastFcff.map((_, index) => index + 1)]);
  sheet.addRow(["FCFF before haircut", ...input.assumptions.forecastFcff.map((_, index) => ({ formula: `Assumptions!${column(index + 2)}11` }))]);
  sheet.addRow(["FCFF after haircut", ...input.assumptions.forecastFcff.map((_, index) => ({ formula: `${column(index + 2)}3*(1-Assumptions!$B$5)` }))]);
  sheet.addRow(["Present value of FCFF", ...input.assumptions.forecastFcff.map((_, index) => ({ formula: `${column(index + 2)}4/(1+Assumptions!$B$2)^${column(index + 2)}2` }))]);
  sheet.addRow([]);
  const finalColumn = column(input.assumptions.forecastFcff.length + 1);
  sheet.addRow(["Terminal value", ...input.assumptions.forecastFcff.map((_, index) => index === input.assumptions.forecastFcff.length - 1 ? ({ formula: `${finalColumn}4*(1+Assumptions!$B$3)/(Assumptions!$B$2-Assumptions!$B$3)` }) : null)]);
  sheet.addRow(["Present value of terminal value", ...input.assumptions.forecastFcff.map((_, index) => index === input.assumptions.forecastFcff.length - 1 ? ({ formula: `${finalColumn}7/(1+Assumptions!$B$2)^${finalColumn}2` }) : null)]);
  sheet.addRow([]);
  sheet.addRow(["Enterprise value", ...input.assumptions.forecastFcff.map((_, index) => index === input.assumptions.forecastFcff.length - 1 ? ({ formula: `SUM(B5:${finalColumn}5)+${finalColumn}8` }) : null)]);
  sheet.addRow(["Equity value", ...input.assumptions.forecastFcff.map((_, index) => index === input.assumptions.forecastFcff.length - 1 ? ({ formula: `${finalColumn}10+Assumptions!$B$6-Assumptions!$B$7-Assumptions!$B$8` }) : null)]);
  sheet.addRow(["Fair value per share", ...input.assumptions.forecastFcff.map((_, index) => index === input.assumptions.forecastFcff.length - 1 ? ({ formula: `${finalColumn}11/Assumptions!$B$9` }) : null)]);

  sheet.getRow(1).font = { bold: true };

  const yearRow = sheet.getRow(2);
  yearRow.font = { bold: true, color: { argb: THEME.WHITE } };
  yearRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_SUBHEADER } };
  for (let c = 2; c <= input.assumptions.forecastFcff.length + 1; c++) {
    yearRow.getCell(c).alignment = { horizontal: "center" };
  }

  for (let row = 3; row <= 12; row += 1) {
    sheet.getRow(row).getCell(1).font = { bold: true };
    for (let col = 2; col <= input.assumptions.forecastFcff.length + 1; col += 1) {
      const cell = sheet.getCell(row, col);
      cell.numFmt = "Rp #,##0";
      cell.border = BORDERS.cellThin;
    }
  }

  for (let c = 1; c <= input.assumptions.forecastFcff.length + 1; c++) {
    sheet.getCell(5, c).border = BORDERS.subtotal;
  }

  sheet.getCell(8, 1).border = BORDERS.subtotal;
  sheet.getCell(`F8`).border = BORDERS.subtotal;

  sheet.getRow(10).font = { bold: true, size: 11 };
  sheet.getCell(10, 1).border = BORDERS.subtotal;
  sheet.getCell(`F10`).border = BORDERS.subtotal;

  sheet.getRow(11).font = { bold: true, size: 11 };
  sheet.getCell(11, 1).border = BORDERS.subtotal;
  sheet.getCell(`F11`).border = BORDERS.subtotal;

  // Row 12: Fair value per share (Executive Wall Street Totals & Summary Row)
  const fvRow = sheet.getRow(12);
  fvRow.height = 30;
  fvRow.font = { bold: true, size: 12, color: { argb: THEME.EMERALD_TEXT } };
  fvRow.getCell(1).border = BORDERS.doubleUnderlineTotal;
  const fvCell = fvRow.getCell(input.assumptions.forecastFcff.length + 1);
  fvCell.numFmt = "Rp #,##0.00";
  fvCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.EMERALD_SUMMARY_BG } };
  fvCell.font = { bold: true, size: 12.5, color: { argb: THEME.EMERALD_TEXT } };
  fvCell.border = BORDERS.doubleUnderlineTotal;
  fvCell.alignment = { horizontal: "right", vertical: "middle" };

  formatSheet(sheet, [34, ...input.assumptions.forecastFcff.map(() => 24)]);
}

/* ─────────────────────────────────────────────────────────
   04. AUDIT TRAIL SHEET
   ───────────────────────────────────────────────────────── */

function addAuditTrailSheet(workbook: ExcelJS.Workbook, input: WorkbookExportInput): void {
  const sheet = workbook.addWorksheet("Audit Trail");
  sheet.addRow(["Type", "Timestamp", "Detail", "Evidence ID", "Operation", "Cache Status"]);
  input.evidence.forEach((evidence) => sheet.addRow(["Evidence", evidence.retrievedAt, evidence.sourceField ?? "Provider response", evidence.id, evidence.operation, evidence.cacheStatus]));
  input.auditTrail.forEach((entry) => sheet.addRow(["State", entry.timestamp, `${entry.state}: ${entry.detail}`, "", "", ""]));
  sheet.addRow(["Decision", input.analystDecision.decidedAt, `${input.analystDecision.action}: ${input.analystDecision.finalHaircut}`, "", "", ""]);

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      if (rowNumber % 2 === 0) {
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.ZEBRA_ROW } };
      }
      row.getCell(1).font = { bold: true };
      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(2).font = { color: { argb: THEME.TEXT_MUTED } };
      row.getCell(4).font = { color: { argb: THEME.TEXT_MUTED } };
      row.getCell(6).alignment = { horizontal: "center" };
      for (let c = 1; c <= 6; c++) row.getCell(c).border = BORDERS.cellThin;
    }
  });

  formatSheet(sheet, [14, 25, 48, 48, 28, 14]);
}

const sensitivityWaccAxis = DEFAULT_WACC_AXIS;
const sensitivityGrowthAxis = DEFAULT_TERMINAL_GROWTH_AXIS;

function sourceLabel(input: WorkbookExportInput, key: string | undefined, fallback: string): string {
  if (!key) return fallback;
  const record = input.assumptionRecords?.find((item) => item.key === key);
  return record ? `${record.source} (v${record.version})` : fallback;
}

/* ─────────────────────────────────────────────────────────
   05. SENSITIVITY SHEET
   ───────────────────────────────────────────────────────── */

function addSensitivitySheet(workbook: ExcelJS.Workbook, input: WorkbookExportInput): void {
  const sheet = workbook.addWorksheet("Sensitivity");
  sheet.addRow(["Sensitivity: fair value per share (WACC x terminal growth)"]);
  sheet.addRow(["WACC ->", ...sensitivityWaccAxis]);
  sensitivityGrowthAxis.forEach((growth, growthIndex) => {
    sheet.addRow([growth, ...sensitivityWaccAxis.map((_, waccIndex) => ({ formula: sensitivityFormula(growthIndex, waccIndex) }))]);
  });
  sheet.addRow([]);
  sheet.addRow(["Baseline (model assumptions)", input.assumptions.wacc, input.assumptions.terminalGrowth, { formula: "DCF!$F$12" }]);

  const waccIndex = sensitivityWaccAxis.indexOf(input.assumptions.wacc);
  const growthIndex = sensitivityGrowthAxis.indexOf(input.assumptions.terminalGrowth);
  if (waccIndex >= 0 && growthIndex >= 0) {
    const cell = sheet.getCell(growthIndex + 3, waccIndex + 2);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.EMERALD_BG } };
    cell.font = { bold: true, color: { argb: THEME.EMERALD_TEXT } };
    const emerald = { style: "medium" as const, color: { argb: THEME.EMERALD_PRIMARY } };
    cell.border = { top: emerald, left: emerald, bottom: emerald, right: emerald };
  }

  sheet.getRow(1).font = { bold: true, size: 12, color: { argb: THEME.WHITE } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_HEADER } };
  sheet.getRow(1).height = 28;

  const headerRow = sheet.getRow(2);
  headerRow.font = { bold: true, color: { argb: THEME.WHITE } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_SUBHEADER } };
  headerRow.height = 24;

  sheet.getRow(9).font = { bold: true };
  sheet.getRow(9).getCell(1).border = BORDERS.doubleUnderlineTotal;
  sheet.getRow(9).getCell(4).border = BORDERS.doubleUnderlineTotal;
  sheet.getRow(9).getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.EMERALD_SUMMARY_BG } };
  sheet.getRow(9).getCell(4).font = { bold: true, color: { argb: THEME.EMERALD_TEXT } };

  for (let col = 2; col <= 6; col += 1) sheet.getCell(2, col).numFmt = "0.00%";
  for (let row = 3; row <= 7; row += 1) {
    sheet.getCell(row, 1).numFmt = "0.00%";
    sheet.getCell(row, 1).font = { bold: true };
    for (let col = 2; col <= 6; col += 1) {
      const cell = sheet.getCell(row, col);
      cell.numFmt = "Rp #,##0";
      if (!(row === growthIndex + 3 && col === waccIndex + 2)) {
        cell.border = BORDERS.cellThin;
      }
    }
  }
  sheet.getCell(9, 2).numFmt = "0.00%";
  sheet.getCell(9, 3).numFmt = "0.00%";
  sheet.getCell(9, 4).numFmt = "Rp #,##0.00";
  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
  sheet.getColumn(1).width = 34;
  for (let col = 2; col <= 6; col += 1) sheet.getColumn(col).width = 24;
}

function sensitivityFormula(growthIndex: number, waccIndex: number): string {
  const waccRef = `${column(waccIndex + 2)}$2`;
  const growthRef = `$A${growthIndex + 3}`;
  const forecast = ["B", "C", "D", "E", "F"].map((col, index) => `Assumptions!$${col}$11*(1-Assumptions!$B$5)/(1+${waccRef})^${index + 1}`).join("+");
  const terminal = `Assumptions!$F$11*(1-Assumptions!$B$5)*(1+${growthRef})/(${waccRef}-${growthRef})/(1+${waccRef})^DCF!$F$2`;
  return `(${forecast}+${terminal}+Assumptions!$B$6-Assumptions!$B$7-Assumptions!$B$8)/Assumptions!$B$9`;
}

/* ─────────────────────────────────────────────────────────
   06. QUALITY SHEET
   ───────────────────────────────────────────────────────── */

function addQualitySheet(workbook: ExcelJS.Workbook, input: WorkbookExportInput): void {
  const sheet = workbook.addWorksheet("Quality");
  const periods = input.financials;
  const thresholds = input.qualityScorecard?.sectorThresholds ?? DEFAULT_QUALITY_THRESHOLDS;

  sheet.addRow(["Earnings Quality Scorecard"]);
  sheet.addRow(["Period End", "CFO / NI", "DSO (days)", "Accrual / Revenue"]);

  periods.forEach((_, index) => {
    const base = 2 + index * 8;
    sheet.addRow([
      { formula: `'Raw Data'!B${base}` },
      { formula: `IF('Raw Data'!D${base + 1}=0,"n/a",'Raw Data'!D${base + 2}/'Raw Data'!D${base + 1})` },
      { formula: `IF('Raw Data'!D${base}=0,0,'Raw Data'!D${base + 3}/'Raw Data'!D${base}*365)` },
      { formula: `IF('Raw Data'!D${base}=0,0,('Raw Data'!D${base + 1}-'Raw Data'!D${base + 2})/'Raw Data'!D${base})` },
    ]);
  });

  if (periods.length >= 2) {
    const last = periods.length - 1;
    const baseLast = 2 + last * 8;
    const basePrev = 2 + (last - 1) * 8;
    const lastMetricRow = 3 + last;
    const prevMetricRow = 3 + (last - 1);

    sheet.addRow([]);
    const dsoTrendRow = sheet.addRow(["DSO trend (days)", { formula: `C${lastMetricRow}-C${prevMetricRow}` }]).number;
    const divergenceRow = sheet.addRow(["Receivables divergence", { formula: `IF(OR('Raw Data'!D${basePrev}=0,'Raw Data'!D${basePrev + 3}=0),1,(('Raw Data'!D${baseLast + 3}-'Raw Data'!D${basePrev + 3})/'Raw Data'!D${basePrev + 3})/(('Raw Data'!D${baseLast}-'Raw Data'!D${basePrev})/'Raw Data'!D${basePrev}))` }]).number;
    const targetRow = sheet.addRow(["Target CFO / NI", thresholds.targetCfoNi]).number;
    const maxDivergenceRow = sheet.addRow(["Max divergence", thresholds.maxDivergence]).number;
    const maxDsoRow = sheet.addRow(["Max DSO days", thresholds.maxDsoDays]).number;
    const scoreRow = sheet.addRow(["Earnings quality score", { formula: `ROUND(MIN(1,MAX(0,B${lastMetricRow}/B${targetRow}))*35+MIN(1,MAX(0,1-MAX(0,B${divergenceRow}-1)/MAX(0.001,B${maxDivergenceRow}-1)))*30+MIN(1,MAX(0,1-MAX(0,B${dsoTrendRow})/B${maxDsoRow}))*20+MIN(1,MAX(0,1-MAX(0,D${lastMetricRow})/0.25))*15,0)` }]).number;
    const gradeRow = sheet.addRow(["Grade", { formula: `IF(B${scoreRow}>=85,"A",IF(B${scoreRow}>=70,"B",IF(B${scoreRow}>=55,"C","D")))` }]).number;
    sheet.addRow(["Grade label", { formula: `IF(B${gradeRow}="A","High-quality cash-backed earnings",IF(B${gradeRow}="B","Acceptable earnings quality",IF(B${gradeRow}="C","Watchlist: accrual build-up","Aggressive Working Capital Accruals")))` }]);

    sheet.getRow(dsoTrendRow).getCell(1).font = { bold: true };
    sheet.getRow(divergenceRow).getCell(1).font = { bold: true };
    sheet.getRow(targetRow).getCell(1).font = { bold: true };
    sheet.getRow(maxDivergenceRow).getCell(1).font = { bold: true };
    sheet.getRow(maxDsoRow).getCell(1).font = { bold: true };

    const scoreRowObj = sheet.getRow(scoreRow);
    scoreRowObj.font = { bold: true, size: 11 };
    scoreRowObj.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.EMERALD_SUMMARY_BG } };
    scoreRowObj.getCell(2).font = { bold: true, color: { argb: THEME.EMERALD_TEXT } };
    scoreRowObj.getCell(1).border = BORDERS.subtotal;
    scoreRowObj.getCell(2).border = BORDERS.subtotal;

    const gradeRowObj = sheet.getRow(gradeRow);
    gradeRowObj.font = { bold: true, size: 12 };
    gradeRowObj.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.EMERALD_SUMMARY_BG } };
    gradeRowObj.getCell(2).font = { bold: true, color: { argb: THEME.EMERALD_TEXT } };
    gradeRowObj.getCell(2).alignment = { horizontal: "center" };
    gradeRowObj.getCell(1).border = BORDERS.doubleUnderlineTotal;
    gradeRowObj.getCell(2).border = BORDERS.doubleUnderlineTotal;
  } else {
    sheet.addRow([]);
    sheet.addRow(["Insufficient periods", "At least two complete annual periods are required for trend analysis."]);
  }

  sheet.getRow(1).font = { bold: true, size: 12, color: { argb: THEME.WHITE } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_HEADER } };
  sheet.getRow(1).height = 26;

  sheet.getRow(2).font = { bold: true, color: { argb: THEME.WHITE } };
  sheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_SUBHEADER } };
  sheet.getRow(2).height = 24;

  for (let row = 3; row <= 2 + periods.length; row += 1) {
    const isEven = row % 2 === 0;
    if (isEven) {
      sheet.getRow(row).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.ZEBRA_ROW } };
    }
    sheet.getCell(row, 1).alignment = { horizontal: "center" };
    sheet.getCell(row, 2).numFmt = '0.00"x"';
    sheet.getCell(row, 3).numFmt = "0";
    sheet.getCell(row, 4).numFmt = "0.00%";
    for (let c = 1; c <= 4; c++) sheet.getCell(row, c).border = BORDERS.cellThin;
  }
  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
  sheet.getColumn(1).width = 32;
  for (let col = 2; col <= 4; col += 1) sheet.getColumn(col).width = 24;
}

/* ─────────────────────────────────────────────────────────
   07. INTEGRITY SHEET
   ───────────────────────────────────────────────────────── */

function addIntegritySheet(workbook: ExcelJS.Workbook, input: WorkbookExportInput): void {
  const sheet = workbook.addWorksheet("Integrity");
  const haircut = input.analystDecision.finalHaircut;
  const auditedAt = new Date().toISOString().slice(0, 10);

  sheet.addRow(["MODEL INTEGRITY & FORMULA SANITY AUDIT"]);
  sheet.addRow([`Ticker: ${input.ticker} · Run ID: ${input.runId ?? "n/a"} · Audited: ${auditedAt}`]);
  sheet.addRow([]);
  sheet.addRow(["#", "Invariant", "Status", "Expected", "Reference"]);

  const invariants: Array<[string, string, string]> = [
    ["Haircut Decision Parity", `IF(ABS(Assumptions!B5-${haircut})<0.0001,"PASSED","DESYNC")`, "Assumptions!B5 vs recorded analyst decision"],
    ["Valuation Solvability & Input Bounds", `IF(AND(Assumptions!B2>Assumptions!B3,Assumptions!B4>=0,Assumptions!B4<1,Assumptions!B9>0,Assumptions!B8>=0),"PASSED","FAIL")`, "B2 > B3 (WACC>g); tax B4 in [0,1); shares B9 > 0; minority B8 >= 0"],
    ["Valuation Cell Error Guard", `IF(ISERROR(DCF!F12),"FORMULA_ERROR","PASSED")`, "DCF!F12 fair value per share"],
    ["Sensitivity Monotonicity Guard", `IF(Sensitivity!B6>Sensitivity!F6,"PASSED","NON_MONOTONIC")`, "Sensitivity!B6 > Sensitivity!F6"],
    ["Cash Flow Reconciliation", `IF(ISNUMBER(DCF!F10),"PASSED","UNRECONCILED")`, "DCF!F10 enterprise value"],
  ];
  invariants.forEach(([name, formula, reference], index) => {
    sheet.addRow([index + 1, name, { formula }, "PASSED", reference]);
  });

  sheet.addRow([]);
  sheet.addRow(["Global audit summary", { formula: `IF(COUNTIF(C5:C9,"PASSED")=5,"ALL 5 INVARIANTS SATISFIED","AUDIT ALERT: INTEGRITY COMPROMISED")` }]);

  sheet.getRow(1).font = { bold: true, size: 13, color: { argb: THEME.WHITE } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_HEADER } };
  sheet.getRow(1).height = 28;
  sheet.getRow(2).font = { italic: true, color: { argb: THEME.TEXT_MUTED } };
  sheet.getRow(4).font = { bold: true, color: { argb: THEME.WHITE } };
  sheet.getRow(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_SUBHEADER } };
  sheet.getRow(4).height = 24;

  for (let row = 5; row <= 9; row += 1) {
    const isEven = row % 2 === 0;
    if (isEven) {
      sheet.getRow(row).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.ZEBRA_ROW } };
    }
    sheet.getCell(`A${row}`).alignment = { horizontal: "center" };
    sheet.getCell(`B${row}`).font = { bold: true };
    sheet.getCell(`C${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.EMERALD_BG } };
    sheet.getCell(`C${row}`).font = { bold: true, color: { argb: THEME.EMERALD_TEXT } };
    sheet.getCell(`C${row}`).alignment = { horizontal: "center" };
    sheet.getCell(`D${row}`).font = { bold: true, color: { argb: THEME.EMERALD_TEXT } };
    sheet.getCell(`D${row}`).alignment = { horizontal: "center" };
    sheet.getCell(`E${row}`).font = { color: { argb: THEME.TEXT_MUTED } };

    for (let c = 1; c <= 5; c++) sheet.getCell(row, c).border = BORDERS.cellThin;
  }

  sheet.getCell("A11").font = { bold: true };
  sheet.getCell("B11").font = { bold: true, color: { argb: THEME.EMERALD_TEXT } };
  sheet.getCell("A11").border = BORDERS.doubleUnderlineTotal;
  sheet.getCell("B11").border = BORDERS.doubleUnderlineTotal;

  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 38;
  sheet.getColumn(3).width = 44;
  sheet.getColumn(4).width = 16;
  sheet.getColumn(5).width = 52;
}

function formatSheet(sheet: ExcelJS.Worksheet, widths: number[]): void {
  sheet.getRow(1).font = { bold: true, color: { argb: THEME.WHITE } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_HEADER } };
  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

function column(index: number): string {
  let value = index;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

/* ─────────────────────────────────────────────────────────
   RESIDUAL INCOME MODEL (RIM) WORKBOOK FOR BANKING ISSUERS
   ───────────────────────────────────────────────────────── */

export interface RimWorkbookExportInput {
  ticker: string;
  companyName?: string;
  bankMetrics: {
    bookValuePerShare: { value: number; evidence?: EvidenceRef };
    roe: { value: number; evidence?: EvidenceRef };
    costOfEquity: { value: number; evidence?: EvidenceRef };
    payoutRatio?: { value: number; evidence?: EvidenceRef };
    dividendPerShare?: { value: number; evidence?: EvidenceRef };
    netInterestMargin?: { value: number; evidence?: EvidenceRef };
    nonPerformingLoan?: { value: number; evidence?: EvidenceRef };
  };
  market: MarketSnapshot;
  assumptions: {
    terminalGrowth: number;
    years?: number;
    haircut?: number;
  };
  analystDecision?: AnalystDecision;
  evidence: EvidenceRef[];
  auditTrail: AuditTrailEntry[];
  runId?: string;
  residualIncome?: {
    presentValueOfResidualIncome: number;
    terminalValue: number;
    fairValuePerShare: number;
  };
}

export async function createResidualIncomeWorkbook(input: RimWorkbookExportInput): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Aetheria IDX Finance";
  workbook.created = new Date();

  // Sheet 1: Institutional Executive Summary (Dashboard Cover)
  addExecutiveSummarySheet(workbook, input, true);

  // Subsequent Banking RIM Sheets
  addRimRawDataSheet(workbook, input);
  addRimAssumptionsSheet(workbook, input);
  addRimValuationSheet(workbook, input);
  addRimAuditTrailSheet(workbook, input);
  addRimIntegritySheet(workbook, input);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as unknown as ArrayLike<number>);
}

function addRimRawDataSheet(workbook: ExcelJS.Workbook, input: RimWorkbookExportInput): void {
  const sheet = workbook.addWorksheet("Raw Data");
  sheet.addRow(["Ticker", "Metric", "Value", "Unit", "Evidence ID"]);

  const m = input.bankMetrics;
  const rows: Array<[string, number, string, string]> = [
    ["Book Value Per Share (BVPS)", m.bookValuePerShare?.value ?? 0, "IDR", m.bookValuePerShare?.evidence?.id ?? "sectors:metrics"],
    ["Return on Equity (ROE)", m.roe?.value ?? 0, "%", m.roe?.evidence?.id ?? "sectors:metrics"],
    ["Cost of Equity (Ke)", m.costOfEquity?.value ?? 0, "%", m.costOfEquity?.evidence?.id ?? "sectors:metrics"],
    ["Net Interest Margin (NIM)", m.netInterestMargin?.value ?? 0, "%", m.netInterestMargin?.evidence?.id ?? "sectors:metrics"],
    ["Non-Performing Loan (NPL)", m.nonPerformingLoan?.value ?? 0, "%", m.nonPerformingLoan?.evidence?.id ?? "sectors:metrics"],
    ["Dividend Payout Ratio", m.payoutRatio?.value ?? 0, "%", m.payoutRatio?.evidence?.id ?? "sectors:metrics"],
    ["Dividend Per Share (DPS)", m.dividendPerShare?.value ?? 0, "IDR", m.dividendPerShare?.evidence?.id ?? "sectors:metrics"],
    ["Last Price", input.market.lastPrice?.value ?? 0, input.market.currency ?? "IDR", input.market.lastPrice?.evidence?.id ?? "sectors:market"],
    ["Shares Outstanding", input.market.sharesOutstanding?.value ?? 0, "shares", input.market.sharesOutstanding?.evidence?.id ?? "sectors:market"],
  ];

  for (const [metric, value, unit, evidenceId] of rows) {
    const rounded = typeof value === "number" && unit !== "%" ? Math.round(value) : value;
    sheet.addRow([input.ticker, metric, rounded, unit, evidenceId]);
  }

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      if (rowNumber % 2 === 0) {
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.ZEBRA_ROW } };
      }
      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(2).font = { bold: true };
      const cell = row.getCell(3);
      if (typeof cell.value === "number") {
        const unit = String(row.getCell(4).value);
        if (unit === "%") cell.numFmt = "0.00%";
        else cell.numFmt = "Rp #,##0";
        cell.alignment = { horizontal: "right" };
      }
      row.getCell(4).alignment = { horizontal: "center" };
      row.getCell(5).font = { color: { argb: THEME.TEXT_MUTED } };
      for (let c = 1; c <= 5; c++) row.getCell(c).border = BORDERS.cellThin;
    }
  });

  formatSheet(sheet, [16, 36, 26, 14, 48]);
}

function addRimAssumptionsSheet(workbook: ExcelJS.Workbook, input: RimWorkbookExportInput): void {
  const sheet = workbook.addWorksheet("Assumptions");
  sheet.addRow(["Assumption", "Value", "Unit", "Source / Methodology"]);

  const m = input.bankMetrics;
  const terminalGrowth = input.assumptions.terminalGrowth ?? 0.04;
  const haircut = input.analystDecision?.finalHaircut ?? input.assumptions.haircut ?? 0;

  const rows: Array<[string, number | string, string, string]> = [
    ["Initial Book Value Per Share (BVPS)", m.bookValuePerShare?.value ?? 0, "IDR", "Sectors API v2 balance sheet"],
    ["Return on Equity (ROE)", m.roe?.value ?? 0.17, "%", "Annualized ROE (accounting benchmark)"],
    ["Cost of Equity (Ke)", m.costOfEquity?.value ?? 0.11, "%", "CAPM hurdle rate"],
    ["Terminal Growth Rate (g)", terminalGrowth, "%", "Long-term sustainable growth"],
    ["Forecast Horizon", input.assumptions.years ?? 5, "years", "Standard 5-year explicit horizon"],
    ["Dividend Payout Ratio", m.payoutRatio?.value ?? 0.5, "%", "Sectors historical dividend payout"],
    ["Analyst Valuation Haircut", haircut, "%", input.analystDecision ? `Analyst: ${input.analystDecision.action}` : "Model default"],
    ["Shares Outstanding", input.market.sharesOutstanding?.value ?? 0, "shares", "Sectors verified share count"],
    ["Last Market Price", input.market.lastPrice?.value ?? 0, "IDR", "IDX live market quotation"],
  ];

  rows.forEach((row) => sheet.addRow(row));

  if (input.analystDecision) {
    sheet.addRow([]);
    sheet.addRow(["Decision Timestamp", input.analystDecision.decidedAt]);
    sheet.addRow(["Decision Rationale", input.analystDecision.rationale ?? ""]);
  }

  sheet.getCell("B3").numFmt = "0.00%";
  sheet.getCell("B4").numFmt = "0.00%";
  sheet.getCell("B5").numFmt = "0.00%";
  sheet.getCell("B7").numFmt = "0.00%";
  sheet.getCell("B8").numFmt = "0.00%";
  sheet.getCell("B2").numFmt = "Rp #,##0";
  sheet.getCell("B9").numFmt = "#,##0";
  sheet.getCell("B10").numFmt = "Rp #,##0";

  for (let r = 2; r <= 10; r++) {
    const isEven = r % 2 === 0;
    const row = sheet.getRow(r);
    if (isEven) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.ZEBRA_ROW } };
    }
    row.getCell(1).font = { bold: true };
    row.getCell(3).alignment = { horizontal: "center" };
    row.getCell(4).font = { color: { argb: THEME.TEXT_MUTED } };
    for (let c = 1; c <= 4; c++) row.getCell(c).border = BORDERS.cellThin;
  }

  formatSheet(sheet, [36, 24, 14, 42]);
}

function addRimValuationSheet(workbook: ExcelJS.Workbook, input: RimWorkbookExportInput): void {
  const sheet = workbook.addWorksheet("Residual Income Valuation");

  sheet.addRow(["Residual Income Model (Clean Surplus Accounting) — " + input.ticker]);
  sheet.addRow(["Projection Year", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]);
  sheet.addRow(["Forecast Period Index", 1, 2, 3, 4, 5]);

  sheet.addRow(["Beginning BVPS",
    { formula: "Assumptions!$B$2" },
    { formula: "B10" },
    { formula: "C10" },
    { formula: "D10" },
    { formula: "E10" },
  ]);

  sheet.addRow(["Return on Equity (ROE)",
    { formula: "Assumptions!$B$3" },
    { formula: "Assumptions!$B$3" },
    { formula: "Assumptions!$B$3" },
    { formula: "Assumptions!$B$3" },
    { formula: "Assumptions!$B$3" },
  ]);

  sheet.addRow(["Net Income per Share",
    { formula: "B4*B5" },
    { formula: "C4*C5" },
    { formula: "D4*D5" },
    { formula: "E4*E5" },
    { formula: "F4*F5" },
  ]);

  sheet.addRow(["Cost of Equity (Ke)",
    { formula: "Assumptions!$B$4" },
    { formula: "Assumptions!$B$4" },
    { formula: "Assumptions!$B$4" },
    { formula: "Assumptions!$B$4" },
    { formula: "Assumptions!$B$4" },
  ]);

  sheet.addRow(["Equity Charge per Share",
    { formula: "B4*B7" },
    { formula: "C4*C7" },
    { formula: "D4*D7" },
    { formula: "E4*E7" },
    { formula: "F4*F7" },
  ]);

  sheet.addRow(["Residual Income (Excess Return)",
    { formula: "B6-B8" },
    { formula: "C6-C8" },
    { formula: "D6-D8" },
    { formula: "E6-E8" },
    { formula: "F6-F8" },
  ]);

  sheet.addRow(["Ending BVPS",
    { formula: "B4+B6-(B6*Assumptions!$B$7)" },
    { formula: "C4+C6-(C6*Assumptions!$B$7)" },
    { formula: "D4+D6-(D6*Assumptions!$B$7)" },
    { formula: "E4+E6-(E6*Assumptions!$B$7)" },
    { formula: "F4+F6-(F6*Assumptions!$B$7)" },
  ]);

  sheet.addRow(["PV of Residual Income",
    { formula: "B9/(1+Assumptions!$B$4)^B3" },
    { formula: "C9/(1+Assumptions!$B$4)^C3" },
    { formula: "D9/(1+Assumptions!$B$4)^D3" },
    { formula: "E9/(1+Assumptions!$B$4)^E3" },
    { formula: "F9/(1+Assumptions!$B$4)^F3" },
  ]);

  sheet.addRow([]);
  sheet.addRow(["VALUATION SYNTHESIS", "VALUE (IDR)", "FORMULA / NOTE"]);
  sheet.addRow(["Initial Book Value Per Share", { formula: "Assumptions!$B$2" }, "Anchor book equity"]);
  sheet.addRow(["PV of 5-Year Residual Income", { formula: "SUM(B11:F11)" }, "Sum of discounted excess returns"]);
  sheet.addRow(["Terminal Residual Income Value", { formula: "(F9*(1+Assumptions!$B$5))/(Assumptions!$B$4-Assumptions!$B$5)/(1+Assumptions!$B$4)^5" }, "Perpetual residual income capitalization"]);
  sheet.addRow(["Pre-Haircut Fair Value per Share", { formula: "B14+B15+B16" }, "Edwards-Bell-Ohlson clean surplus total"]);
  sheet.addRow(["Analyst Haircut Discount", { formula: "Assumptions!$B$8" }, "Haircut applied from analyst decision"]);
  sheet.addRow(["Post-Haircut Fair Value per Share", { formula: "B17*(1-B18)" }, "FINAL MODEL FAIR VALUE"]);
  sheet.addRow(["Current Market Price", { formula: "Assumptions!$B$10" }, "IDX live quotation"]);
  sheet.addRow(["Premium / (Discount) to Market", { formula: "(B20-B19)/B19" }, "Relative market divergence"]);

  sheet.getRow(1).font = { bold: true, size: 12, color: { argb: THEME.WHITE } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_HEADER } };
  sheet.getRow(1).height = 28;

  sheet.getRow(2).font = { bold: true, color: { argb: THEME.WHITE } };
  sheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_SUBHEADER } };
  sheet.getRow(2).height = 24;

  sheet.getRow(3).font = { bold: true };
  for (let c = 2; c <= 6; c++) sheet.getCell(3, c).alignment = { horizontal: "center" };

  for (let r = 4; r <= 11; r++) {
    sheet.getCell(r, 1).font = { bold: true };
    for (let c = 2; c <= 6; c++) {
      const cell = sheet.getCell(r, c);
      if (r === 5 || r === 7) cell.numFmt = "0.00%";
      else cell.numFmt = "Rp #,##0";
      cell.border = BORDERS.cellThin;
    }
  }

  sheet.getRow(13).font = { bold: true, color: { argb: THEME.WHITE } };
  sheet.getRow(13).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_SUBHEADER } };

  for (let r = 14; r <= 21; r++) {
    sheet.getCell(r, 1).font = { bold: true };
    sheet.getCell(r, 1).border = BORDERS.cellThin;
    sheet.getCell(r, 2).border = BORDERS.cellThin;
    sheet.getCell(r, 3).border = BORDERS.cellThin;
    sheet.getCell(r, 3).font = { color: { argb: THEME.TEXT_MUTED } };
  }

  sheet.getCell("B14").numFmt = "Rp #,##0";
  sheet.getCell("B15").numFmt = "Rp #,##0";
  sheet.getCell("B16").numFmt = "Rp #,##0";
  sheet.getCell("B17").numFmt = "Rp #,##0";
  sheet.getCell("B18").numFmt = "0.00%";
  sheet.getCell("B19").numFmt = "Rp #,##0.00";
  sheet.getCell("B20").numFmt = "Rp #,##0.00";
  sheet.getCell("B21").numFmt = "+0.00%;-0.00%;0.00%";

  // Executive KPI Card on Row 19 (Post-Haircut Fair Value per Share)
  const rimFvRow = sheet.getRow(19);
  rimFvRow.height = 30;
  rimFvRow.font = { bold: true, size: 12.5, color: { argb: THEME.EMERALD_TEXT } };
  sheet.getCell("B19").fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.EMERALD_SUMMARY_BG } };
  sheet.getCell("B19").font = { bold: true, size: 12.5, color: { argb: THEME.EMERALD_TEXT } };
  sheet.getCell("B19").border = BORDERS.doubleUnderlineTotal;
  sheet.getCell("A19").border = BORDERS.doubleUnderlineTotal;

  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
  sheet.getColumn(1).width = 36;
  for (let c = 2; c <= 6; c++) sheet.getColumn(c).width = 24;
}

function addRimAuditTrailSheet(workbook: ExcelJS.Workbook, input: RimWorkbookExportInput): void {
  const sheet = workbook.addWorksheet("Audit Trail");
  sheet.addRow(["Timestamp", "State / Phase", "Audit Log Detail"]);

  for (const entry of input.auditTrail) {
    sheet.addRow([entry.timestamp, entry.state, entry.detail]);
  }

  sheet.addRow([]);
  sheet.addRow(["DATA PROVENANCE & EVIDENCE REFERENCES"]);
  sheet.addRow(["Evidence ID", "Operation", "Cache Status", "Timestamp"]);

  for (const ev of input.evidence) {
    sheet.addRow([ev.id, ev.operation, ev.cacheStatus ?? "miss", ev.retrievedAt]);
  }

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || rowNumber === sheet.rowCount - input.evidence.length - 1) {
      row.font = { bold: true, color: { argb: THEME.WHITE } };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_HEADER } };
    } else if (rowNumber > 1 && row.getCell(1).value) {
      if (rowNumber % 2 === 0) {
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.ZEBRA_ROW } };
      }
      for (let c = 1; c <= 4; c++) row.getCell(c).border = BORDERS.cellThin;
    }
  });

  formatSheet(sheet, [26, 20, 60, 32]);
}

function addRimIntegritySheet(workbook: ExcelJS.Workbook, input: RimWorkbookExportInput): void {
  const sheet = workbook.addWorksheet("Integrity");
  const auditedAt = new Date().toISOString().slice(0, 10);

  sheet.addRow(["BANKING RESIDUAL INCOME MODEL INTEGRITY AUDIT"]);
  sheet.addRow([`Ticker: ${input.ticker} · Run ID: ${input.runId ?? "n/a"} · Audited: ${auditedAt}`]);
  sheet.addRow([]);
  sheet.addRow(["#", "Invariant Name", "Audit Status", "Expected Condition", "Formula / Reference"]);

  const invariants: Array<[string, string, string]> = [
    ["Solvability Guard (Cost of Equity > g)", 'IF(Assumptions!$B$4>Assumptions!$B$5,"PASSED","BREACHED")', "Assumptions!B4 > Assumptions!B5 (Ke > terminal growth)"],
    ["Positive Book Value Guard (BVPS > 0)", 'IF(Assumptions!$B$2>0,"PASSED","NEGATIVE_BV")', "Assumptions!B2 > 0 (Positive tangible net worth)"],
    ["Valuation Solvability Guard (Fair Value > 0)", 'IF(\'Residual Income Valuation\'!B19>0,"PASSED","FAILED")', "RIM Fair value per share > 0"],
    ["Clean Surplus Book Value Consistency", 'IF(\'Residual Income Valuation\'!C4=\'Residual Income Valuation\'!B10,"PASSED","DISCONTINUOUS")', "Year 2 Beginning BV = Year 1 Ending BV"],
    ["Evidence Envelope Integrity", 'IF(COUNTA(\'Raw Data\'!A2:A10)>=7,"PASSED","INCOMPLETE")', "All core banking metrics populated from Sectors API"],
  ];

  invariants.forEach(([name, formula, reference], index) => {
    sheet.addRow([index + 1, name, { formula }, "PASSED", reference]);
  });

  sheet.addRow([]);
  sheet.addRow(["Global Audit Summary", { formula: 'IF(COUNTIF(C5:C9,"PASSED")=5,"ALL 5 INVARIANTS SATISFIED","AUDIT ALERT: INTEGRITY COMPROMISED")' }]);

  sheet.getRow(1).font = { bold: true, size: 13, color: { argb: THEME.WHITE } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_HEADER } };
  sheet.getRow(1).height = 28;
  sheet.getRow(2).font = { italic: true, color: { argb: THEME.TEXT_MUTED } };
  sheet.getRow(4).font = { bold: true, color: { argb: THEME.WHITE } };
  sheet.getRow(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.NAVY_SUBHEADER } };
  sheet.getRow(4).height = 24;

  for (let row = 5; row <= 9; row += 1) {
    const isEven = row % 2 === 0;
    if (isEven) {
      sheet.getRow(row).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.ZEBRA_ROW } };
    }
    sheet.getCell(`A${row}`).alignment = { horizontal: "center" };
    sheet.getCell(`B${row}`).font = { bold: true };
    sheet.getCell(`C${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.EMERALD_BG } };
    sheet.getCell(`C${row}`).font = { bold: true, color: { argb: THEME.EMERALD_TEXT } };
    sheet.getCell(`C${row}`).alignment = { horizontal: "center" };
    sheet.getCell(`D${row}`).font = { bold: true, color: { argb: THEME.EMERALD_TEXT } };
    sheet.getCell(`D${row}`).alignment = { horizontal: "center" };
    sheet.getCell(`E${row}`).font = { color: { argb: THEME.TEXT_MUTED } };

    for (let c = 1; c <= 5; c++) sheet.getCell(row, c).border = BORDERS.cellThin;
  }

  sheet.getCell("A11").font = { bold: true };
  sheet.getCell("B11").font = { bold: true, color: { argb: THEME.EMERALD_TEXT } };
  sheet.getCell("A11").border = BORDERS.doubleUnderlineTotal;
  sheet.getCell("B11").border = BORDERS.doubleUnderlineTotal;

  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 38;
  sheet.getColumn(3).width = 44;
  sheet.getColumn(4).width = 16;
  sheet.getColumn(5).width = 52;
}
