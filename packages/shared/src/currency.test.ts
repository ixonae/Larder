import { describe, expect, it } from "vitest";
import {
  CURRENCY_CODES,
  currencyMinorDigits,
  currencyName,
  currencySchema,
  DEFAULT_CURRENCY,
  formatMoney,
  fromMinorUnits,
  toMinorUnits,
} from "./currency.ts";

describe("CURRENCY_CODES", () => {
  it("lists real currencies once each, sorted, without X codes", () => {
    expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
    expect([...CURRENCY_CODES].sort()).toEqual([...CURRENCY_CODES]);
    expect(CURRENCY_CODES.filter((code) => code.startsWith("X"))).toEqual([]);
    expect(CURRENCY_CODES).toEqual(expect.arrayContaining(["JPY", "USD", "EUR", "GBP", "KWD"]));
    expect(CURRENCY_CODES).toContain(DEFAULT_CURRENCY);
  });

  it("works with Intl for every code, which each have a name of their own", () => {
    for (const code of CURRENCY_CODES) {
      expect(
        () => new Intl.NumberFormat("en", { style: "currency", currency: code }),
      ).not.toThrow();
      expect(currencyName(code)).not.toBe(code);
      expect([0, 2, 3]).toContain(currencyMinorDigits(code));
      expect(formatMoney(12345, code)).toContain("1");
      expect(toMinorUnits(fromMinorUnits(12345, code), code)).toBe(12345);
    }
  });
});

describe("currencySchema", () => {
  it("accepts listed codes only", () => {
    expect(currencySchema.parse("JPY")).toBe("JPY");
    for (const bad of ["jpy", "Yen", "XXX", "XAU", "XTS", "", "US", null, 392]) {
      expect(currencySchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("currencyName", () => {
  it("names a currency in a locale", () => {
    expect(currencyName("JPY")).toMatch(/^Japanese yen$/i);
    expect(currencyName("JPY", "fr")).toMatch(/yen japonais/i);
  });
});

describe("currencyMinorDigits", () => {
  it.each([
    ["JPY", 0],
    ["KRW", 0],
    ["USD", 2],
    ["EUR", 2],
    ["KWD", 3],
    ["BHD", 3],
    ["ISK", 0],
    ["UGX", 0],
    ["CLP", 0],
    ["IQD", 3],
    ["IDR", 2],
    ["HUF", 2],
  ] as const)("%s has %i", (code, digits) => {
    expect(currencyMinorDigits(code)).toBe(digits);
  });
});

describe("toMinorUnits", () => {
  it.each([
    [0, "USD", 0],
    [0, "JPY", 0],
    [19.99, "USD", 1999],
    [0.1 + 0.2, "USD", 30],
    [1.15, "USD", 115],
    [4.35, "USD", 435],
    [8.2, "USD", 820],
    [1.005, "USD", 101],
    [2.675, "USD", 268],
    [0.004, "USD", 0],
    [0.005, "USD", 1],
    [0.015, "USD", 2],
    [1.0005, "KWD", 1001],
    [1.2345, "KWD", 1235],
    [1500, "JPY", 1500],
    [1500.5, "JPY", 1501],
    [1500.4, "JPY", 1500],
    [-19.99, "USD", -1999],
    [-1.005, "USD", -101],
    [-0.001, "USD", 0],
    [1e-7, "USD", 0],
    [123456789.99, "USD", 12345678999],
    [9007199254740.99, "USD", 900719925474099],
  ] as const)("%d %s → %d", (amount, code, minor) => {
    expect(toMinorUnits(amount, code)).toBe(minor);
  });

  it("never returns negative zero", () => {
    expect(Object.is(toMinorUnits(-0.001, "USD"), 0)).toBe(true);
    expect(Object.is(toMinorUnits(-0, "JPY"), 0)).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e20, -1e20])(
    "refuses %d",
    (amount) => {
      expect(() => toMinorUnits(amount, "USD")).toThrow(RangeError);
    },
  );
});

describe("fromMinorUnits", () => {
  it.each([
    [0, "USD", 0],
    [1999, "USD", 19.99],
    [5, "USD", 0.05],
    [1500, "JPY", 1500],
    [1001, "KWD", 1.001],
    [-1999, "USD", -19.99],
    [12345678999, "USD", 123456789.99],
  ] as const)("%d %s → %d", (minor, code, amount) => {
    expect(fromMinorUnits(minor, code)).toBe(amount);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])("refuses %d", (minor) => {
    expect(() => fromMinorUnits(minor, "USD")).toThrow(RangeError);
  });

  it("round-trips every cent up to a thousand", () => {
    for (let minor = -1000; minor <= 1000; minor++) {
      expect(toMinorUnits(fromMinorUnits(minor, "USD"), "USD")).toBe(minor);
    }
  });
});

describe("formatMoney", () => {
  it("formats minor units for the currency and locale", () => {
    expect(formatMoney(1999, "USD")).toBe("$19.99");
    expect(formatMoney(150000, "JPY")).toMatch(/^[¥￥]150,000$/);
    expect(formatMoney(1001, "KWD")).toMatch(/^KWD\s1\.001$/u);
    expect(formatMoney(0, "USD")).toBe("$0.00");
    expect(formatMoney(-500, "USD")).toBe("-$5.00");
    expect(formatMoney(123456789012, "USD")).toBe("$1,234,567,890.12");
    expect(formatMoney(1999, "EUR", "fr")).toMatch(/^19,99\s€$/u);
    expect(formatMoney(1999, "USD", "en")).toBe("$19.99");
    // ISO digits win over Intl's own: IQD has 3 minor digits even where CLDR shows none.
    expect(formatMoney(1500, "IQD")).toMatch(/^IQD\s1\.500$/u);
    expect(formatMoney(1500, "ISK")).toMatch(/^ISK\s1,500$/u);
  });
});
