import ExcelJS from "exceljs";
import type { AnalystDecision, ResearchState } from "../../agent-orchestrator/src/index";
import type { AnnualFinancialStatement, EvidenceRef, MarketSnapshot } from "../../domain/src/index";
import { calculateDcf, type DcfInputs } from "../../finance-engine/src/index";

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
  financials: AnnualFinancialStatement[];
  market: MarketSnapshot;
  assumptions: WorkbookAssumptions;
  analystDecision: AnalystDecision;
  evidence: EvidenceRef[];
  auditTrail: AuditTrailEntry[];
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
  addRawDataSheet(workbook, input);
  addAssumptionsSheet(workbook, input);
  addDcfSheet(workbook, input);
  addAuditTrailSheet(workbook, input);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as unknown as ArrayLike<number>);
}

function addRawDataSheet(workbook: ExcelJS.Workbook, input: WorkbookExportInput): void {
  const sheet = workbook.addWorksheet("Raw Data");
  sheet.addRow(["Ticker", "Period End", "Metric", "Value", "Currency", "Evidence ID"]);
  for (const statement of input.financials) {
    const rows = [
      ["Revenue", statement.revenue], ["Net Income", statement.netIncome], ["Operating Cash Flow", statement.operatingCashFlow],
      ["Accounts Receivable", statement.accountsReceivable], ["EBIT", statement.ebit], ["D&A", statement.depreciationAndAmortization],
      ["Capital Expenditure", statement.capitalExpenditure], ["Change in NWC", statement.changeInNwc],
    ] as const;
    for (const [metric, source] of rows) sheet.addRow([input.ticker, statement.periodEnd, metric, source.value, source.sourceCurrency ?? statement.currency, source.evidence.id]);
  }
  sheet.addRow([input.ticker, input.market.asOf, "Last Price", input.market.lastPrice.value, input.market.currency, input.market.lastPrice.evidence.id]);
  sheet.addRow([input.ticker, input.market.asOf, "Shares Outstanding", input.market.sharesOutstanding.value, input.market.currency, input.market.sharesOutstanding.evidence.id]);
  formatSheet(sheet, [14, 15, 24, 20, 12, 44]);
}

function addAssumptionsSheet(workbook: ExcelJS.Workbook, input: WorkbookExportInput): void {
  const sheet = workbook.addWorksheet("Assumptions");
  sheet.addRow(["Assumption", "Value", "Unit", "Source / Author"]);
  const rows = [
    ["WACC", input.assumptions.wacc, "%", "User-visible assumption"],
    ["Terminal Growth", input.assumptions.terminalGrowth, "%", "User-visible assumption"],
    ["Tax Rate", input.assumptions.taxRate, "%", "User-visible assumption"],
    ["FCFF Haircut", input.analystDecision.finalHaircut, "%", `Analyst: ${input.analystDecision.action}`],
    ["Cash", input.assumptions.cash, "IDR", "User-visible assumption (Sectors balance data pending)"],
    ["Total Debt", input.assumptions.totalDebt, "IDR", "User-visible assumption (Sectors balance data pending)"],
    ["Minority Interest", input.assumptions.minorityInterest, "IDR", "User-visible assumption"],
    ["Shares Outstanding", input.assumptions.sharesOutstanding, "shares", "Sectors evidence"],
  ];
  rows.forEach((row) => sheet.addRow(row));
  sheet.addRow([]);
  sheet.addRow(["Forecast FCFF", ...input.assumptions.forecastFcff]);
  sheet.addRow(["Decision Timestamp", input.analystDecision.decidedAt]);
  sheet.addRow(["Decision Rationale", input.analystDecision.rationale ?? ""]);
  sheet.getColumn(2).numFmt = "0.0%";
  for (let index = 6; index <= 9; index += 1) sheet.getCell(`B${index}`).numFmt = "#,##0";
  for (let index = 2; index <= input.assumptions.forecastFcff.length + 1; index += 1) sheet.getCell(11, index).numFmt = "#,##0";
  formatSheet(sheet, [24, 18, 14, 28, 16, 16]);
}

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
  for (let row = 3; row <= 12; row += 1) for (let col = 2; col <= input.assumptions.forecastFcff.length + 1; col += 1) sheet.getCell(row, col).numFmt = "#,##0";
  formatSheet(sheet, [30, ...input.assumptions.forecastFcff.map(() => 16)]);
}

function addAuditTrailSheet(workbook: ExcelJS.Workbook, input: WorkbookExportInput): void {
  const sheet = workbook.addWorksheet("Audit Trail");
  sheet.addRow(["Type", "Timestamp", "Detail", "Evidence ID", "Operation", "Cache Status"]);
  input.evidence.forEach((evidence) => sheet.addRow(["Evidence", evidence.retrievedAt, evidence.sourceField ?? "Provider response", evidence.id, evidence.operation, evidence.cacheStatus]));
  input.auditTrail.forEach((entry) => sheet.addRow(["State", entry.timestamp, `${entry.state}: ${entry.detail}`, "", "", ""]));
  sheet.addRow(["Decision", input.analystDecision.decidedAt, `${input.analystDecision.action}: ${input.analystDecision.finalHaircut}`, "", "", ""]);
  formatSheet(sheet, [14, 25, 48, 48, 28, 14]);
}

function formatSheet(sheet: ExcelJS.Worksheet, widths: number[]): void {
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172033" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
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
