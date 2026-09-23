export interface MemoClaim {
  token: string;
  value: number;
  percentage: boolean;
  magnitude: number;
  currency: string | null;
  verified: boolean;
  matchedLedger?: number;
}

export interface MemoVerification {
  total: number;
  verified: number;
  unverified: number;
  passed: boolean;
  claims: MemoClaim[];
}

export interface RedactionResult {
  text: string;
  redacted: number;
}

export const RELATIVE_EPSILON = 1e-3;
export const ABSOLUTE_EPSILON = 0.01;

const NUMERIC_TOKEN_PATTERN = /(?:(?:US\$|USD|Rp\.?|IDR|\$)\s*)?-?\d[\d.,]*\s*(?:%|(?:triliun|trillion|miliar|billion|juta|million|thousand|ribu|tn|bn|mn|rb|k|t|b|m)\b)?/gi;

const CURRENCY_PREFIX = /^(US\$|USD|Rp\.?|IDR|\$)\s*/i;

const MAGNITUDES: Array<[RegExp, number]> = [
  [/^(triliun|trillion|tn|t)$/i, 1e12],
  [/^(miliar|billion|bn|b)$/i, 1e9],
  [/^(juta|million|mn|m)$/i, 1e6],
  [/^(ribu|thousand|rb|k)$/i, 1e3],
];

export interface MemoVerificationOptions {
  baseCurrency?: string;
}

export function verifyMemoClaims(memoText: string, financialLedger: number[], options: MemoVerificationOptions = {}): MemoVerification {
  const baseCurrency = options.baseCurrency ?? "IDR";
  const ledger = financialLedger.filter((value) => typeof value === "number" && Number.isFinite(value));
  const claims: MemoClaim[] = [];

  for (const match of memoText.matchAll(NUMERIC_TOKEN_PATTERN)) {
    const token = match[0].trim();
    if (!token) continue;
    const parsed = parseNumericToken(token);
    if (!parsed || isIgnorable(parsed)) continue;
    const currencyMismatch = parsed.currency != null && parsed.currency !== baseCurrency;
    const matchedLedger = currencyMismatch ? undefined : ledger.find((ledgerValue) => parsed.candidates.some((candidate) => matchesLedger(candidate, ledgerValue)));
    claims.push({
      token,
      value: parsed.candidates[0] ?? Number.NaN,
      percentage: parsed.percentage,
      magnitude: parsed.magnitude,
      currency: parsed.currency,
      verified: matchedLedger !== undefined,
      matchedLedger,
    });
  }

  const verified = claims.filter((claim) => claim.verified).length;
  return { total: claims.length, verified, unverified: claims.length - verified, passed: claims.length > 0 && verified === claims.length, claims };
}

export function redactUnverifiedClaims(memoText: string, verification: MemoVerification): RedactionResult {
  let text = memoText;
  let redacted = 0;
  for (const claim of verification.claims) {
    if (claim.verified) continue;
    const index = text.indexOf(claim.token);
    if (index === -1) continue;
    text = `${text.slice(0, index)}[unverified]${text.slice(index + claim.token.length)}`;
    redacted += 1;
  }
  return { text, redacted };
}

interface ParsedNumericToken {
  numericPart: string;
  unit: string;
  magnitude: number;
  percentage: boolean;
  currency: string | null;
  candidates: number[];
}

export function parseNumericToken(token: string): ParsedNumericToken | null {
  const trimmed = token.trim();
  const percentage = /%$/.test(trimmed);
  const withoutPercent = percentage ? trimmed.slice(0, -1).trim() : trimmed;
  const currencyMatch = withoutPercent.match(CURRENCY_PREFIX);
  const currency = currencyMatch ? normalizeCurrency(currencyMatch[1]) : null;
  const rest = currencyMatch ? withoutPercent.slice(currencyMatch[0].length).trim() : withoutPercent;
  const numericMatch = rest.match(/^-?\d[\d.,]*/);
  if (!numericMatch) return null;
  const numericPart = numericMatch[0];
  const unit = rest.slice(numericPart.length).replace(/[^a-zA-Z]/g, "");
  const magnitude = magnitudeOf(unit);
  const candidates = candidateNumbers(numericPart).map((value) => value * magnitude);
  return { numericPart, unit, magnitude, percentage, currency, candidates };
}

function normalizeCurrency(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value === "us$" || value === "usd" || value === "$") return "USD";
  return "IDR";
}

function magnitudeOf(unit: string): number {
  if (!unit) return 1;
  for (const [pattern, factor] of MAGNITUDES) if (pattern.test(unit)) return factor;
  return 1;
}

function isIgnorable(parsed: ParsedNumericToken): boolean {
  if (parsed.percentage || parsed.magnitude !== 1) return false;
  const numeric = Number(parsed.numericPart.replace(/,/g, ""));
  return Number.isFinite(numeric) && Number.isInteger(numeric) && numeric >= 1900 && numeric <= 2099;
}

function candidateNumbers(numericPart: string): number[] {
  const cleaned = numericPart.replace(/\s/g, "").trim();
  const results = new Set<number>();
  const add = (value: string) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) results.add(parsed);
  };
  add(cleaned);
  add(cleaned.replace(/,/g, ""));
  add(cleaned.replace(/\./g, ""));
  add(cleaned.replace(/\./g, "").replace(/,/g, "."));
  return [...results];
}

function matchesLedger(candidate: number, ledgerValue: number): boolean {
  return [candidate, candidate / 100, candidate * 100].some((variant) => closeEnough(variant, ledgerValue));
}

function closeEnough(left: number, right: number): boolean {
  return Math.abs(left - right) <= ABSOLUTE_EPSILON + RELATIVE_EPSILON * Math.abs(right);
}

export interface DirectionalDelta {
  metric: string;
  delta: number;
}

export interface DirectionalCheck {
  metric: string;
  delta: number;
  word: string;
  expected: "up" | "down";
  passed: boolean;
}

export interface DirectionalVerification {
  passed: boolean;
  checks: DirectionalCheck[];
}

const UP_WORDS = ["naik", "meningkat", "ekspansi", "tumbuh", "membaik", "positif"];
const DOWN_WORDS = ["turun", "menurun", "melemah", "menyusut", "negatif"];

export function verifyMemoDirection(memoText: string, deltas: DirectionalDelta[]): DirectionalVerification {
  const sentences = memoText.split(/[.;\n]/).map((sentence) => sentence.trim()).filter(Boolean);
  const checks: DirectionalCheck[] = [];
  for (const { metric, delta } of deltas) {
    const keyword = metric.toLowerCase();
    const sentence = sentences.find((candidate) => candidate.toLowerCase().includes(keyword));
    if (!sentence) continue;
    const lower = sentence.toLowerCase();
    const upWord = UP_WORDS.find((word) => lower.includes(word));
    const downWord = DOWN_WORDS.find((word) => lower.includes(word));
    if (upWord && delta < 0) checks.push({ metric, delta, word: upWord, expected: "down", passed: false });
    else if (downWord && delta > 0) checks.push({ metric, delta, word: downWord, expected: "up", passed: false });
    else checks.push({ metric, delta, word: upWord ?? downWord ?? "neutral", expected: delta >= 0 ? "up" : "down", passed: true });
  }
  return { passed: checks.every((check) => check.passed), checks };
}