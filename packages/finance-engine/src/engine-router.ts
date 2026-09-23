import type { CalculationResult } from "./index";

export type ValuationModel = "FCFF_DCF" | "RESIDUAL_INCOME" | "DIVIDEND_DISCOUNT";

export interface ModelApplicability {
  ticker?: string;
  sector?: string;
  coverage: "non_financial" | "financial" | "unknown";
  model: ValuationModel;
  modelLabel: string;
  rationale: string;
  alternatives: ValuationModel[];
}

const FINANCIAL_SECTORS = new Set([
  "financials",
  "financial",
  "financial services",
  "banking",
  "banks",
  "bank",
  "multifinance",
  "insurance",
]);

export function isFinancialSector(sector?: string): boolean {
  if (!sector) return false;
  return FINANCIAL_SECTORS.has(sector.trim().toLowerCase());
}

export function routeValuationModel(input: { ticker?: string; sector?: string }): ModelApplicability {
  const isFin = isFinancialSector(input.sector);
  const result: ModelApplicability = isFin
    ? {
        ticker: input.ticker,
        sector: input.sector,
        coverage: "financial",
        model: "RESIDUAL_INCOME",
        modelLabel: "Residual Income Model (RIM)",
        rationale: "Banks and financial issuers are valued on equity book value plus excess return over cost of equity. FCFF DCF is not applicable because debt and capex are operating inputs, not financing items.",
        alternatives: ["DIVIDEND_DISCOUNT"],
      }
    : {
        ticker: input.ticker,
        sector: input.sector,
        coverage: input.sector ? "non_financial" : "unknown",
        model: "FCFF_DCF",
        modelLabel: "FCFF Discounted Cash Flow",
        rationale: "Non-financial issuers are valued on free cash flow to firm discounted at WACC with a terminal growth assumption.",
        alternatives: [],
      };
  if (input.ticker) {
    console.log(`[Engine Router] Selected Model: ${result.model} (${result.coverage}) for ${input.ticker}`);
  }
  return result;
}

export interface ResidualIncomeInputs {
  bookValuePerShare: number;
  roe: number;
  costOfEquity: number;
  growth: number;
  payoutRatio: number;
  years: number;
}

export interface ResidualIncomeValue {
  presentValueOfResidualIncome: number;
  terminalValue: number;
  fairValuePerShare: number;
}

export function calculateResidualIncome(input: Partial<ResidualIncomeInputs>): CalculationResult<ResidualIncomeValue> {
  const fields = ["bookValuePerShare", "roe", "costOfEquity", "growth", "payoutRatio", "years"] as const;
  const missing = fields.filter((field) => !isFiniteNumber(input[field]));
  if (missing.length > 0) return { status: "incomplete_data", missing: [...missing] };

  const values = input as ResidualIncomeInputs;
  if (!(values.costOfEquity > values.growth)) return { status: "invalid_assumption", reason: "WACC_MUST_EXCEED_TERMINAL_GROWTH" };
  if (values.bookValuePerShare <= 0) return { status: "incomplete_data", missing: ["bookValuePerShare"] };
  if (values.payoutRatio < 0 || values.payoutRatio > 1) return { status: "invalid_assumption", reason: "INVALID_HAIRCUT" };
  if (values.years < 1) return { status: "incomplete_data", missing: ["years"] };

  let book = values.bookValuePerShare;
  let presentValueOfResidualIncome = 0;
  let lastResidualIncome = 0;
  for (let year = 1; year <= values.years; year += 1) {
    const residualIncome = (values.roe - values.costOfEquity) * book;
    presentValueOfResidualIncome += residualIncome / (1 + values.costOfEquity) ** year;
    lastResidualIncome = residualIncome;
    book = book * (1 + values.roe * (1 - values.payoutRatio));
  }

  const terminalResidualIncome = lastResidualIncome * (1 + values.growth);
  const terminalValue = terminalResidualIncome / (values.costOfEquity - values.growth) / (1 + values.costOfEquity) ** values.years;
  return {
    status: "ok",
    value: {
      presentValueOfResidualIncome,
      terminalValue,
      fairValuePerShare: values.bookValuePerShare + presentValueOfResidualIncome + terminalValue,
    },
  };
}

export interface DividendDiscountInputs {
  dividendPerShare: number;
  costOfEquity: number;
  growth: number;
}

export interface DividendDiscountValue {
  nextDividend: number;
  fairValuePerShare: number;
}

export function calculateDividendDiscount(input: Partial<DividendDiscountInputs>): CalculationResult<DividendDiscountValue> {
  const fields = ["dividendPerShare", "costOfEquity", "growth"] as const;
  const missing = fields.filter((field) => !isFiniteNumber(input[field]));
  if (missing.length > 0) return { status: "incomplete_data", missing: [...missing] };

  const values = input as DividendDiscountInputs;
  if (!(values.costOfEquity > values.growth)) return { status: "invalid_assumption", reason: "WACC_MUST_EXCEED_TERMINAL_GROWTH" };
  if (values.dividendPerShare < 0) return { status: "incomplete_data", missing: ["dividendPerShare"] };

  const nextDividend = values.dividendPerShare * (1 + values.growth);
  return { status: "ok", value: { nextDividend, fairValuePerShare: nextDividend / (values.costOfEquity - values.growth) } };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}