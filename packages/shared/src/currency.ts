import { z } from "zod";
import { displayName } from "./display-name.ts";

/**
 * ISO 4217 currencies in circulation, excluding the "X" codes (precious metals, testing and
 * supranational units such as XXX, XTS and XAU), fund codes, and withdrawn codes such as ANG
 * (replaced by XCG in 2025) and BGN (replaced by EUR in 2026). Hard-coded rather than read from
 * `Intl.supportedValuesOf` so the API and every browser always agree.
 */
// biome-ignore format: Keep the ISO codes in compact rows.
export const CURRENCY_CODES = [
  "AED", "AFN", "ALL", "AMD", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD", "BDT", "BHD",
  "BIF", "BMD", "BND", "BOB", "BRL", "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF",
  "CLP", "CNY", "COP", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP", "ERN",
  "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD",
  "HNL", "HTG", "HUF", "IDR", "ILS", "INR", "IQD", "IRR", "ISK", "JMD", "JOD", "JPY", "KES",
  "KGS", "KHR", "KMF", "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL",
  "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN",
  "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP",
  "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SEK",
  "SGD", "SHP", "SLE", "SOS", "SRD", "SSP", "STN", "SVC", "SYP", "SZL", "THB", "TJS", "TMT",
  "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX", "USD", "UYU", "UZS", "VED", "VES",
  "VND", "VUV", "WST", "YER", "ZAR", "ZMW", "ZWG",
] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/** What a new bar uses until its owner chooses another currency. */
export const DEFAULT_CURRENCY: CurrencyCode = "JPY";

/** An uppercase ISO 4217 code from the list above. */
export const currencySchema = z.enum(CURRENCY_CODES);

/** The currency's name in `locale` ("JPY" → "Japanese Yen"). */
export const currencyName = (code: CurrencyCode, locale = "en") =>
  displayName("currency", code, locale);

/**
 * ISO 4217 minor units of the currencies that do not use 2. Hard-coded rather than read from Intl,
 * whose CLDR data changes between ICU versions and differs from ISO for some codes (IQD: 3 in ISO,
 * 0 in CLDR): stored minor units must mean the same amount on the API and in every browser.
 */
const MINOR_DIGITS: Partial<Record<CurrencyCode, 0 | 3>> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
};

/** Digits after the decimal point, per ISO 4217: JPY 0, USD 2, KWD 3. */
export const currencyMinorDigits = (code: CurrencyCode): number => MINOR_DIGITS[code] ?? 2;

const formatters = new Map<string, Intl.NumberFormat>();

/** Formats with exactly the ISO digits, so the display matches what the minor units mean. */
function formatter(code: CurrencyCode, locale: string): Intl.NumberFormat {
  const key = `${locale}/${code}`;
  let format = formatters.get(key);
  if (!format) {
    const digits = currencyMinorDigits(code);
    format = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(key, format);
  }
  return format;
}

/** `amount` shifted by `digits` decimal places, by moving the exponent so no float maths drifts. */
function shifted(amount: number, digits: number): number {
  const [mantissa = "0", exponent = "0"] = amount.toExponential().split("e");
  return Number(`${mantissa}e${Number(exponent) + digits}`);
}

/** 19.99 USD → 1999. Rounds half away from zero on the decimal value as written (1.005 → 101). */
export function toMinorUnits(amount: number, code: CurrencyCode): number {
  if (!Number.isFinite(amount)) throw new RangeError("The amount must be a finite number");
  const scaled = shifted(Math.abs(amount), currencyMinorDigits(code));
  const minor = Math.round(scaled) * Math.sign(amount) + 0;
  if (!Number.isSafeInteger(minor)) throw new RangeError("The amount is too large");
  return minor;
}

/** 1999 USD → 19.99. */
export function fromMinorUnits(minor: number, code: CurrencyCode): number {
  if (!Number.isSafeInteger(minor)) throw new RangeError("Minor units must be a safe integer");
  return shifted(minor, -currencyMinorDigits(code));
}

/** 1999 USD → "$19.99", 150000 JPY → "¥150,000" (in `locale`, English by default). */
export function formatMoney(minor: number, code: CurrencyCode, locale = "en"): string {
  return formatter(code, locale).format(fromMinorUnits(minor, code));
}
