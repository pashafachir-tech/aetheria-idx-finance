import type { EarningsQualityScorecard, PeriodQualityMetrics, QualityGrade, QualityThresholds } from "../../domain/src/index";

export type CalculationResult<T> =
  | { status: "ok"; value: T }
  | { status: "incomplete_data"; missing: string[] }
  | { status: "invalid_assumption"; reason: "WACC_MUST_EXCEED_TERMINAL_GROWTH" | "IMPLIED_GROWTH_NOT_SOLVABLE" | "INVALID_HAIRCUT" | "NON_FINITE_OUTPUT" | "UNCONVERGED" };

export interface ForensicPeriod {
  periodEnd: string;
  netIncome?: number | null;
  operatingCashFlow?: number | null;
  revenue?: number | null;
  accountsReceivable?: number | null;
}

export type SignalStatus = "flagged" | "clear" | "not_evaluable";

export interface CfoToNiResult {
  status: SignalStatus;
  threshold: number;
  periods: Array<{ periodEnd: string; ratio: number }>;
}

export interface ReceivablesDivergenceResult {
  status: SignalStatus;
  threshold: number;
  periodEnd?: string;
  revenueGrowth?: number;
  receivablesGrowth?: number;
  ratio?: number;
}

export interface FcffInputs {
  ebit: number;
  taxRate: number;
  depreciationAndAmortization: number;
  capitalExpenditure: number;
  changeInNwc: number;
}

export interface DcfInputs {
  forecastFcff: number[];
  wacc: number;
  terminalGrowth: number;
  cash: number;
  totalDebt: number;
  minorityInterest: number;
  sharesOutstanding: number;
}

export interface DcfValue {
  presentValueOfForecast: number;
  terminalValue: number;
  presentValueOfTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  fairValuePerShare: number;
  dcfApplicable: boolean;
  netCashPosition: boolean;
  distressFallbackPerShare: number | null;
  modelStatus?: "NORMAL" | "DISTRESSED_CASHFLOW";
}

export interface ReverseDcfInputs extends DcfInputs {
  marketPrice: number;
}

export interface ReverseDcfValue {
  impliedTerminalGrowth: number;
  impliedEnterpriseValue: number;
}

export function applyFcffHaircut(forecastFcff: number[], haircut: number): CalculationResult<number[]> {
  if (!Array.isArray(forecastFcff) || forecastFcff.length === 0 || forecastFcff.some((value) => !isFiniteNumber(value))) {
    return { status: "incomplete_data", missing: ["forecastFcff"] };
  }
  if (!isFiniteNumber(haircut) || haircut < 0 || haircut > 1) {
    return { status: "invalid_assumption", reason: "INVALID_HAIRCUT" };
  }
  return { status: "ok", value: forecastFcff.map((fcff) => fcff * (1 - haircut)) };
}

export function validateDcfInputs(input: Partial<DcfInputs>): CalculationResult<DcfInputs> {
  const missing = missingDcfFields(input);
  return missing.length === 0 ? { status: "ok", value: input as DcfInputs } : { status: "incomplete_data", missing };
}

export function validateForensicPeriods(periods: ForensicPeriod[]): CalculationResult<ForensicPeriod[]> {
  const missing = periods.flatMap((period) => {
    const fields = ["netIncome", "operatingCashFlow", "revenue", "accountsReceivable"] as const;
    return fields.filter((field) => !isFiniteNumber(period[field])).map((field) => `${period.periodEnd}.${field}`);
  });
  return missing.length === 0 ? { status: "ok", value: periods } : { status: "incomplete_data", missing };
}

export function evaluateCfoToNi(periods: ForensicPeriod[], threshold = 0.7): CfoToNiResult {
  const evaluable = periods
    .filter((period): period is ForensicPeriod & { netIncome: number; operatingCashFlow: number } =>
      isFiniteNumber(period.netIncome) && isFiniteNumber(period.operatingCashFlow) && period.netIncome > 0,
    )
    .map((period) => ({ periodEnd: period.periodEnd, ratio: period.operatingCashFlow / period.netIncome }));

  if (evaluable.length < 2) return { status: "not_evaluable", threshold, periods: evaluable };

  const latestTwo = evaluable.slice(-2);
  return {
    status: latestTwo.every((period) => period.ratio < threshold) ? "flagged" : "clear",
    threshold,
    periods: evaluable,
  };
}

export function evaluateReceivablesDivergence(
  periods: ForensicPeriod[],
  threshold = 1.5,
  minimumRevenueGrowth = 0.01,
): ReceivablesDivergenceResult {
  if (periods.length < 2) return { status: "not_evaluable", threshold };
  const previous = periods.at(-2);
  const current = periods.at(-1);
  if (!previous || !current || !isFiniteNumber(previous.revenue) || !isFiniteNumber(current.revenue)
    || !isFiniteNumber(previous.accountsReceivable) || !isFiniteNumber(current.accountsReceivable)
    || previous.revenue === 0 || previous.accountsReceivable === 0) {
    return { status: "not_evaluable", threshold };
  }

  const revenueGrowth = (current.revenue - previous.revenue) / Math.abs(previous.revenue);
  if (Math.abs(revenueGrowth) < minimumRevenueGrowth) return { status: "not_evaluable", threshold, periodEnd: current.periodEnd, revenueGrowth };

  const receivablesGrowth = (current.accountsReceivable - previous.accountsReceivable) / Math.abs(previous.accountsReceivable);
  const ratio = receivablesGrowth / revenueGrowth;
  return { status: ratio > threshold || ratio < 0 ? "flagged" : "clear", threshold, periodEnd: current.periodEnd, revenueGrowth, receivablesGrowth, ratio };
}

export function calculateFcff(input: Partial<FcffInputs>): CalculationResult<number> {
  const missing = missingFields(input, ["ebit", "taxRate", "depreciationAndAmortization", "capitalExpenditure", "changeInNwc"]);
  if (missing.length > 0) return { status: "incomplete_data", missing };
  const { ebit, taxRate, depreciationAndAmortization, capitalExpenditure, changeInNwc } = input as FcffInputs;
  const value = ebit * (1 - taxRate) + depreciationAndAmortization - capitalExpenditure - changeInNwc;
  if (!Number.isFinite(value)) return { status: "invalid_assumption", reason: "NON_FINITE_OUTPUT" };
  return { status: "ok", value };
}

export function calculateDcf(input: Partial<DcfInputs>): CalculationResult<DcfValue> {
  const validation = validateDcfInputs(input);
  if (validation.status !== "ok") return validation;
  const values = validation.value;
  if (values.wacc <= values.terminalGrowth) return { status: "invalid_assumption", reason: "WACC_MUST_EXCEED_TERMINAL_GROWTH" };

  const presentValueOfForecast = values.forecastFcff.reduce((sum, fcff, index) => sum + fcff / (1 + values.wacc) ** (index + 1), 0);
  const finalFcff = values.forecastFcff.at(-1)!;
  const terminalValue = (finalFcff * (1 + values.terminalGrowth)) / (values.wacc - values.terminalGrowth);
  const presentValueOfTerminalValue = terminalValue / (1 + values.wacc) ** values.forecastFcff.length;
  const enterpriseValue = presentValueOfForecast + presentValueOfTerminalValue;
  const equityValue = enterpriseValue + values.cash - values.totalDebt - values.minorityInterest;
  const rawFairValuePerShare = equityValue / values.sharesOutstanding;

  const outputs = [presentValueOfForecast, terminalValue, presentValueOfTerminalValue, enterpriseValue, equityValue, rawFairValuePerShare];
  if (outputs.some((value) => !Number.isFinite(value))) return { status: "invalid_assumption", reason: "NON_FINITE_OUTPUT" };

  const dcfApplicable = values.forecastFcff.some((fcff) => fcff > 0);
  const netCashPosition = values.cash > values.totalDebt;
  const distressFallbackPerShare = (values.cash - values.totalDebt - values.minorityInterest) / values.sharesOutstanding;
  const isDistressed = !dcfApplicable || equityValue <= 0;
  const modelStatus = isDistressed ? "DISTRESSED_CASHFLOW" : "NORMAL";

  return {
    status: "ok",
    value: {
      presentValueOfForecast,
      terminalValue,
      presentValueOfTerminalValue,
      enterpriseValue,
      equityValue,
      fairValuePerShare: dcfApplicable ? rawFairValuePerShare : distressFallbackPerShare,
      dcfApplicable,
      netCashPosition,
      distressFallbackPerShare: dcfApplicable ? null : distressFallbackPerShare,
      modelStatus,
    },
  };
}

export function calculateReverseDcf(input: Partial<ReverseDcfInputs>): CalculationResult<ReverseDcfValue> {
  const missing = [...missingDcfFields(input), ...missingFields(input, ["marketPrice"])];
  if (missing.length > 0) return { status: "incomplete_data", missing };
  const values = input as ReverseDcfInputs;
  if (values.wacc <= values.terminalGrowth) return { status: "invalid_assumption", reason: "WACC_MUST_EXCEED_TERMINAL_GROWTH" };

  const impliedEnterpriseValue = values.marketPrice * values.sharesOutstanding - values.cash + values.totalDebt + values.minorityInterest;
  if (!Number.isFinite(impliedEnterpriseValue)) return { status: "invalid_assumption", reason: "NON_FINITE_OUTPUT" };

  const upperBound = values.wacc - 0.005;
  let low = -0.99;
  let high = upperBound;
  const lowValue = enterpriseValueAtGrowth(values, low);
  const highValue = enterpriseValueAtGrowth(values, high);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) return { status: "invalid_assumption", reason: "UNCONVERGED" };
  if (impliedEnterpriseValue < lowValue || impliedEnterpriseValue > highValue) return { status: "invalid_assumption", reason: "IMPLIED_GROWTH_NOT_SOLVABLE" };

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const midpoint = (low + high) / 2;
    const midValue = enterpriseValueAtGrowth(values, midpoint);
    if (!Number.isFinite(midValue)) return { status: "invalid_assumption", reason: "UNCONVERGED" };
    if (midValue < impliedEnterpriseValue) low = midpoint;
    else high = midpoint;
  }

  const impliedTerminalGrowth = (low + high) / 2;
  if (!Number.isFinite(impliedTerminalGrowth) || impliedTerminalGrowth >= values.wacc - 0.005) return { status: "invalid_assumption", reason: "UNCONVERGED" };
  return { status: "ok", value: { impliedTerminalGrowth, impliedEnterpriseValue } };
}

function enterpriseValueAtGrowth(input: DcfInputs, terminalGrowth: number): number {
  const presentValueOfForecast = input.forecastFcff.reduce((sum, fcff, index) => sum + fcff / (1 + input.wacc) ** (index + 1), 0);
  const terminalValue = (input.forecastFcff.at(-1)! * (1 + terminalGrowth)) / (input.wacc - terminalGrowth);
  return presentValueOfForecast + terminalValue / (1 + input.wacc) ** input.forecastFcff.length;
}

function missingDcfFields(input: Partial<DcfInputs>): string[] {
  const missing = missingFields(input, ["wacc", "terminalGrowth", "cash", "totalDebt", "minorityInterest", "sharesOutstanding"]);
  if (!Array.isArray(input.forecastFcff) || input.forecastFcff.length === 0 || input.forecastFcff.some((value) => !isFiniteNumber(value))) missing.push("forecastFcff");
  if (isFiniteNumber(input.sharesOutstanding) && input.sharesOutstanding <= 0) missing.push("sharesOutstanding");
  return missing;
}

function missingFields<T extends object>(input: Partial<T>, fields: Array<keyof T>): string[] {
  return fields.filter((field) => !isFiniteNumber(input[field])).map(String);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export interface CashFlowBridgeInput {
  netIncome: number;
  depreciationAndAmortization: number;
  changeInNwc: number;
  operatingCashFlow: number;
  capitalExpenditure: number;
  ebit: number;
  taxRate: number;
}

export type CashFlowBridgeKind = "add" | "subtract" | "subtotal" | "total";

export interface CashFlowBridgeLine {
  key: string;
  label: string;
  value: number;
  kind: CashFlowBridgeKind;
  warning: boolean;
}

export interface CashFlowBridge {
  lines: CashFlowBridgeLine[];
  netIncome: number;
  depreciationAndAmortization?: number;
  changeInNwc?: number;
  operatingCashFlow?: number;
  capitalExpenditure?: number;
  cashFromOperations: number;
  fcff: number;
  workingCapitalDrag: number;
  otherAdjustments: number;
  workingCapitalDragPct: number;
  cashLeakPct: number;
}

export function buildCashFlowBridge(input: CashFlowBridgeInput): CalculationResult<CashFlowBridge> {
  const missing = missingFields(input, ["netIncome", "depreciationAndAmortization", "changeInNwc", "operatingCashFlow", "capitalExpenditure", "ebit", "taxRate"]);
  if (missing.length > 0) return { status: "incomplete_data", missing };

  const fcffResult = calculateFcff({
    ebit: input.ebit,
    taxRate: input.taxRate,
    depreciationAndAmortization: input.depreciationAndAmortization,
    capitalExpenditure: input.capitalExpenditure,
    changeInNwc: input.changeInNwc,
  });
  if (fcffResult.status !== "ok") return fcffResult;

  const otherAdjustments = input.operatingCashFlow - (input.netIncome + input.depreciationAndAmortization - input.changeInNwc);
  const taxAndOtherAdjustments = fcffResult.value - (input.operatingCashFlow - input.capitalExpenditure);
  const workingCapitalDragPct = input.netIncome !== 0 ? input.changeInNwc / input.netIncome : 0;
  const cashLeakPct = input.netIncome !== 0 ? (input.netIncome - input.operatingCashFlow) / input.netIncome : 0;

  return {
    status: "ok",
    value: {
      lines: [
        { key: "netIncome", label: "Net income", value: input.netIncome, kind: "add", warning: false },
        { key: "depreciationAndAmortization", label: "Non-cash D&A", value: input.depreciationAndAmortization, kind: "add", warning: false },
        { key: "workingCapitalDrag", label: "Working capital drag (receivables expansion)", value: -input.changeInNwc, kind: "subtract", warning: true },
        { key: "otherAdjustments", label: "Unexplained Working Capital Residual", value: otherAdjustments, kind: "add", warning: false },
        { key: "cashFromOperations", label: "Cash from operations (CFO)", value: input.operatingCashFlow, kind: "subtotal", warning: false },
        { key: "capitalExpenditure", label: "Capital expenditure", value: -input.capitalExpenditure, kind: "subtract", warning: false },
        { key: "taxAndOtherAdjustments", label: "Tax, interest & non-operating adjustments", value: taxAndOtherAdjustments, kind: "add", warning: false },
        { key: "fcff", label: "Free cash flow to firm (FCFF)", value: fcffResult.value, kind: "total", warning: false },
      ],
      netIncome: input.netIncome,
      depreciationAndAmortization: input.depreciationAndAmortization,
      changeInNwc: input.changeInNwc,
      operatingCashFlow: input.operatingCashFlow,
      capitalExpenditure: input.capitalExpenditure,
      cashFromOperations: input.operatingCashFlow,
      fcff: fcffResult.value,
      workingCapitalDrag: input.changeInNwc,
      otherAdjustments,
      workingCapitalDragPct,
      cashLeakPct,
    },
  };
}

export interface ValuationSensitivity {
  wacc: number[];
  terminalGrowth: number[];
  values: Array<Array<number | null>>;
}

export const DEFAULT_WACC_AXIS: number[] = [0.08, 0.09, 0.1, 0.11, 0.12];
export const DEFAULT_TERMINAL_GROWTH_AXIS: number[] = [0.01, 0.02, 0.03, 0.04, 0.05];

export function buildValuationSensitivity(input: DcfInputs, waccAxis: number[], terminalGrowthAxis: number[]): ValuationSensitivity {
  const values = terminalGrowthAxis.map((terminalGrowth) =>
    waccAxis.map((wacc) => {
      const result = calculateDcf({ ...input, wacc, terminalGrowth });
      return result.status === "ok" ? result.value.fairValuePerShare : null;
    }),
  );
  return { wacc: waccAxis, terminalGrowth: terminalGrowthAxis, values };
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = { targetCfoNi: 0.9, maxDivergence: 1.5, maxDsoDays: 90 };

export const QUALITY_THRESHOLDS_BY_SECTOR: Record<string, QualityThresholds> = {
  Energy: { targetCfoNi: 0.85, maxDivergence: 1.4, maxDsoDays: 75 },
  Consumer: { targetCfoNi: 0.95, maxDivergence: 1.3, maxDsoDays: 60 },
  Industrial: { targetCfoNi: 0.9, maxDivergence: 1.4, maxDsoDays: 80 },
  Infrastructure: { targetCfoNi: 0.9, maxDivergence: 1.35, maxDsoDays: 85 },
};

export const QUALITY_GRADE_LABELS: Record<QualityGrade, string> = {
  A: "High-quality cash-backed earnings",
  B: "Acceptable earnings quality",
  C: "Watchlist: accrual build-up",
  D: "Aggressive Working Capital Accruals",
};

export function qualityThresholdsForSector(sector?: string): QualityThresholds {
  if (!sector) return DEFAULT_QUALITY_THRESHOLDS;
  return QUALITY_THRESHOLDS_BY_SECTOR[sector] ?? DEFAULT_QUALITY_THRESHOLDS;
}

export interface EarningsQualityOptions {
  sector?: string;
  thresholds?: QualityThresholds;
}

export function computeEarningsQualityScorecard(periods: ForensicPeriod[], options: EarningsQualityOptions = {}): CalculationResult<EarningsQualityScorecard> {
  const thresholds = options.thresholds ?? qualityThresholdsForSector(options.sector);
  const evaluable = periods.filter(
    (period): period is ForensicPeriod & { netIncome: number; operatingCashFlow: number; revenue: number; accountsReceivable: number } =>
      isFiniteNumber(period.netIncome) && isFiniteNumber(period.operatingCashFlow) && isFiniteNumber(period.revenue) && isFiniteNumber(period.accountsReceivable) && period.revenue > 0,
  );
  if (evaluable.length < 2) return { status: "incomplete_data", missing: ["at least two complete annual periods"] };

  const sorted = [...evaluable].sort((left, right) => Date.parse(left.periodEnd) - Date.parse(right.periodEnd));
  const metrics: PeriodQualityMetrics[] = sorted.map((period) => ({
    periodEnd: period.periodEnd,
    cfoToNiRatio: period.netIncome !== 0 ? period.operatingCashFlow / period.netIncome : 0,
    dsoDays: (period.accountsReceivable / period.revenue) * 365,
    accrualToRevenueRatio: (period.netIncome - period.operatingCashFlow) / period.revenue,
  }));

  const latest = metrics[metrics.length - 1];
  const previous = metrics[metrics.length - 2];
  const dsoTrendDays = latest.dsoDays - previous.dsoDays;
  const receivablesDivergence = evaluateReceivablesDivergence(sorted).ratio ?? 1;

  const cashScore = clamp01(latest.cfoToNiRatio / thresholds.targetCfoNi) * 35;
  
  // Nilai ideal divergensi berada di sekitar 0.8x s/d 1.2x.
  // Nilai < 0 atau > 1.5x adalah RED FLAG.
  let divPenalty = 0;
  if (receivablesDivergence > 1.0) {
    divPenalty = Math.min(30, (Math.max(0, receivablesDivergence - 1.0) / Math.max(0.001, thresholds.maxDivergence - 1.0)) * 30);
  } else if (receivablesDivergence < 0) {
    // Penalti keras untuk divergensi negatif ekstrem
    divPenalty = Math.min(30, Math.abs(receivablesDivergence) * 2.5);
  }
  const divergenceScore = Math.max(0, 30 - divPenalty);

  const dsoScore = clamp01(1 - Math.max(0, dsoTrendDays) / thresholds.maxDsoDays) * 20;
  const accrualScore = clamp01(1 - Math.max(0, latest.accrualToRevenueRatio) / 0.25) * 15;
  let score = Math.round(Math.max(0, Math.min(100, cashScore + divergenceScore + dsoScore + accrualScore)));

  // Hard Guardrail: Cash conversion breach or deficit CFO or negative divergence
  const latestCfo = sorted[sorted.length - 1].operatingCashFlow;
  if (latest.cfoToNiRatio < 0.75 || latestCfo < 0 || receivablesDivergence < 0) {
    score = Math.min(score, 65);
  }
  const grade = gradeForScore(score);

  return {
    status: "ok",
    value: { score, grade, gradeLabel: QUALITY_GRADE_LABELS[grade], periods: metrics, dsoTrendDays, receivablesDivergence, sectorThresholds: thresholds },
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function gradeForScore(score: number): QualityGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

export * from "./engine-router";
export * from "./forensic-engine";
