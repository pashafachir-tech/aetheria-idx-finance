import type { NewsItem } from "../../domain/src/index";

const INJECTION_PATTERNS: RegExp[] = [
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /\[\/?\s*(?:system|inst|assistant|user)\s*\]/gi,
  /\b(?:system|assistant|developer|user)\s*:/gi,
  /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/gi,
  /\bdisregard\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions?|prompts?)/gi,
  /\babaikan\s+(?:semua\s+)?(?:instruksi|perintah)(?:\s+sebelumnya|\s+di\s+atas)?/gi,
  /\bnew\s+instructions?\s*:/gi,
];

const MAX_FIELD_LENGTH = 400;

export function containsPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export function sanitizeNewsText(text: string): string {
  let sanitized = text;
  for (const pattern of INJECTION_PATTERNS) sanitized = sanitized.replace(pattern, "[redacted-instruction]");
  sanitized = sanitized.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
  sanitized = sanitized.replace(/[<>]/g, (character) => (character === "<" ? "&lt;" : "&gt;"));
  return sanitized.slice(0, MAX_FIELD_LENGTH);
}

export function sanitizeNewsContext(news: Array<Pick<NewsItem, "title" | "aiSummary" | "body">>): string {
  const rows = news.map(
    (item, index) =>
      `  <item id="${index + 1}">\n    <title>${sanitizeNewsText(item.title)}</title>\n    <summary>${sanitizeNewsText(item.aiSummary)}</summary>\n    <body>${sanitizeNewsText(item.body)}</body>\n  </item>`,
  );
  return `<untrusted_external_news>\n${rows.join("\n")}\n</untrusted_external_news>`;
}