export type CalculationResult<T> =
  | { status: "ok"; value: T }
  | { status: "incomplete_data"; missing: string[] }
  | { status: "invalid_assumption"; reason: "WACC_MUST_EXCEED_TERMINAL_GROWTH" | "IMPLIED_GROWTH_NOT_SOLVABLE" | "INVALID_HAIRCUT" };

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
  return { status: ratio > threshold ? "flagged" : "clear", threshold, periodEnd: current.periodEnd, revenueGrowth, receivablesGrowth, ratio };
}

export function calculateFcff(input: Partial<FcffInputs>): CalculationResult<number> {
  const missing = missingFields(input, ["ebit", "taxRate", "depreciationAndAmortization", "capitalExpenditure", "changeInNwc"]);
  if (missing.length > 0) return { status: "incomplete_data", missing };
  const { ebit, taxRate, depreciationAndAmortization, capitalExpenditure, changeInNwc } = input as FcffInputs;
  return { status: "ok", value: ebit * (1 - taxRate) + depreciationAndAmortization - capitalExpenditure - changeInNwc };
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
  return { status: "ok", value: { presentValueOfForecast, terminalValue, presentValueOfTerminalValue, enterpriseValue, equityValue, fairValuePerShare: equityValue / values.sharesOutstanding } };
}

export function calculateReverseDcf(input: Partial<ReverseDcfInputs>): CalculationResult<ReverseDcfValue> {
  const missing = [...missingDcfFields(input), ...missingFields(input, ["marketPrice"])];
  if (missing.length > 0) return { status: "incomplete_data", missing };
  const values = input as ReverseDcfInputs;
  const impliedEnterpriseValue = values.marketPrice * values.sharesOutstanding - values.cash + values.totalDebt + values.minorityInterest;
  const upperBound = values.wacc - 0.000001;
  let low = -0.99;
  let high = upperBound;
  const lowValue = enterpriseValueAtGrowth(values, low);
  const highValue = enterpriseValueAtGrowth(values, high);
  if (impliedEnterpriseValue < lowValue || impliedEnterpriseValue > highValue) return { status: "invalid_assumption", reason: "IMPLIED_GROWTH_NOT_SOLVABLE" };

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (enterpriseValueAtGrowth(values, midpoint) < impliedEnterpriseValue) low = midpoint;
    else high = midpoint;
  }
  return { status: "ok", value: { impliedTerminalGrowth: (low + high) / 2, impliedEnterpriseValue } };
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
