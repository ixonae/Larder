import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, countryName, countrySchema } from "./countries.ts";

describe("COUNTRY_CODES", () => {
  it("lists the 249 assigned codes once each, sorted", () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
    expect([...COUNTRY_CODES].sort()).toEqual([...COUNTRY_CODES]);
  });

  it("gives every code a name of its own", () => {
    expect(COUNTRY_CODES.filter((code) => countryName(code) === code)).toEqual([]);
  });
});

describe("countryName", () => {
  it("names a country in English by default and in another locale on request", () => {
    expect(countryName("JP")).toBe("Japan");
    expect(countryName("GB")).toBe("United Kingdom");
    expect(countryName("JP", "fr")).toBe("Japon");
  });
});

describe("countrySchema", () => {
  it("accepts assigned codes", () => {
    expect(countrySchema.parse("JP")).toBe("JP");
  });

  it.each(["jp", "Jp", "JPN", "J", "", "XX", "UK", "Scotland", "Japan", null, 1])(
    "refuses %j",
    (value) => {
      expect(countrySchema.safeParse(value).success).toBe(false);
    },
  );
});
