import { PRODUCT_COPY } from "./product-copy.js";

export const PRODUCT_LANGUAGES = Object.freeze([
  { code: "en", name: "English", locale: "en-US" },
  { code: "zh", name: "中文", locale: "zh-CN" },
  { code: "es", name: "Español", locale: "es-ES" },
  { code: "fr", name: "Français", locale: "fr-FR" },
  { code: "ru", name: "Русский", locale: "ru-RU" },
  { code: "vi", name: "Tiếng Việt", locale: "vi-VN" }
].map(Object.freeze));
export const LANGUAGE_STORAGE_KEY = "ipo-one-language-v1";
export function supportedLanguage(value) {
  if (typeof value !== "string") return null;
  const code = value.toLowerCase().split("-")[0];
  return PRODUCT_LANGUAGES.some(item => item.code === code) ? code : null;
}
export function resolveLanguage(storage, browserLanguages = []) {
  try {
    const saved = supportedLanguage(storage?.getItem(LANGUAGE_STORAGE_KEY));
    if (saved) return saved;
  } catch { /* Storage is optional, never required for product access. */ }
  return browserLanguages.map(supportedLanguage).find(Boolean) ?? "en";
}
export function normalizeCopy(value) { return String(value).replace(/\s+/g, " ").trim(); }
export function formatProductDate(value, language, options) {
  const locale = PRODUCT_LANGUAGES.find(item => item.code === language)?.locale;
  if (!locale) throw new Error("Unsupported product language");
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(value);
}
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const placeholderNames = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
export function validateProductCopy(copy = PRODUCT_COPY) {
  const seen = new Set();
  for (const row of copy) {
    if (!Array.isArray(row) || row.length !== PRODUCT_LANGUAGES.length || !row[0] || seen.has(row[0])) {
      throw new Error("Invalid or duplicate localized product copy");
    }
    seen.add(row[0]);
    const names = JSON.stringify(placeholderNames(row[0]));
    if (row.some(value => typeof value !== "string" || !value.trim() ||
        JSON.stringify(placeholderNames(value)) !== names)) {
      throw new Error(`Missing translation or mismatched placeholders: ${row[0]}`);
    }
  }
  return { entries: copy.length, languages: PRODUCT_LANGUAGES.length };
}
validateProductCopy();
const exact = new Map(PRODUCT_COPY.filter(row => !/\{\w+\}/.test(row[0])).map(row => [normalizeCopy(row[0]), row]));
const folded = new Map([...exact].map(([key, row]) => [key.toLowerCase(), row]));
const numericPlaceholders = new Set(["count", "total", "done", "number", "page", "version", "days", "step"]);
const localizablePlaceholders = new Set(["state", "frequency", "scope", "outcome", "source", "kind", "view", "summary"]);
const datePlaceholders = new Set(["date", "asOf", "attempt"]);
const knownRow = value => typeof value === "string" ? exact.get(value) ?? folded.get(value.toLowerCase()) : undefined;
const dateFallbacks = new Set(["—", "Unavailable", "Not available"]);
const dateValue = value => dateFallbacks.has(value) || /\d/.test(value) && (
  /^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{1,4}[/.]\d{1,2}[/.]\d{1,4}/.test(value) ||
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|ene|abr|ago|dic|janv|févr|mars|avr|mai|juin|juil|août|déc)\.?\b/i.test(value) ||
  /(?:年|月|thg|янв|фев|мар|апр|мая|май|июн|июл|авг|сен|окт|ноя|дек)/i.test(value)
);
const templates = PRODUCT_COPY.filter(row => /\{\w+\}/.test(row[0])).map(row => {
  const names = [];
  const parts = row[0].split(/(\{\w+\})/).map(part => {
    if (/^\{\w+\}$/.test(part)) {
      const name = part.slice(1, -1);
      names.push(name);
      return numericPlaceholders.has(name) ? "([0-9]+)" : "([\\s\\S]+?)";
    }
    return escapePattern(part);
  });
  return { row, names, pattern: new RegExp(`^${parts.join("")}$`) };
});
export function translateCopy(source, language = "en") {
  const normalized = normalizeCopy(source);
  const index = PRODUCT_LANGUAGES.findIndex(item => item.code === language);
  if (index < 0) throw new Error("Unsupported product language");
  let row = exact.get(normalized) ?? folded.get(normalized.toLowerCase());
  let values = {};
  if (!row) for (const template of templates) {
    const match = normalized.match(template.pattern);
    if (!match) continue;
    const candidate = Object.fromEntries(template.names.map((name, i) => [name, match[i + 1]]));
    if (template.names.some(name => localizablePlaceholders.has(name) && !knownRow(candidate[name]) ||
        datePlaceholders.has(name) && !dateValue(candidate[name]) ||
        name === "reference" && !/^[A-Za-z0-9][A-Za-z0-9_:.%/…-]{0,255}$/.test(candidate[name]))) continue;
    row = template.row;
    values = candidate;
    break;
  }
  if (!row) return { text: source, translated: false };
  let complete = true;
  const text = row[index].replace(/\{(\w+)\}/g, (_, name) => {
    const value = values[name];
    const nested = knownRow(value);
    if (localizablePlaceholders.has(name) && !nested) complete = false;
    return (localizablePlaceholders.has(name) || dateFallbacks.has(value) ? nested?.[index] : undefined) ?? value ?? `{${name}}`;
  });
  return { text: index === 0 ? source : `${source.match(/^\s*/)[0]}${text}${source.match(/\s*$/)[0]}`, translated: complete };
}

// Minor-unit integers stay exact, including values beyond Number.MAX_SAFE_INTEGER.
export function formatMinorAmount(minor, currency, language = "en", fractionDigits = 2) {
  if (!/^-?\d+$/.test(String(minor)) || !/^[A-Z]{3}$/.test(currency) ||
      !Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 6) {
    throw new TypeError("Invalid monetary display input");
  }
  const locale = PRODUCT_LANGUAGES.find(item => item.code === language)?.locale;
  if (!locale) throw new Error("Unsupported product language");
  const value = BigInt(minor);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(fractionDigits);
  const parts = new Intl.NumberFormat(locale, {
    style: "currency", currency, minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).formatToParts(negative ? -(absolute / base) : absolute / base);
  const fraction = String(absolute % base).padStart(fractionDigits, "0");
  const decimal = parts.map(part => part.type === "fraction" ? fraction : part.value).join("");
  if (negative && absolute / base === 0n) {
    const sign = new Intl.NumberFormat(locale).formatToParts(-1).find(part => part.type === "minusSign").value;
    return sign + decimal;
  }
  return decimal;
}
