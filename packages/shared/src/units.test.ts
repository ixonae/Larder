import { describe, expect, it } from "vitest";
import {
  convert,
  formatAmount,
  ML_PER_OZ,
  scale,
  toMl,
  UNIT_INFO,
  UNITS,
  type Unit,
  unitNeedsAmount,
  unitSchema,
} from "./units.ts";

describe("unit metadata", () => {
  it("describes every unit", () => {
    expect(Object.keys(UNIT_INFO).sort()).toEqual([...UNITS].sort());
  });

  it.each<[Unit, number | null]>([
    ["ml", 1],
    ["cl", 10],
    ["oz", 29.5735],
    ["tsp", 5],
    ["barspoon", 5],
    ["tbsp", 15],
    ["dash", 0.9],
    ["drop", 0.05],
    ["splash", 5],
    ["piece", null],
    ["slice", null],
    ["wedge", null],
    ["sprig", null],
    ["leaf", null],
    ["top", null],
    ["to_taste", null],
  ])("%s is %s ml", (unit, ml) => {
    expect(UNIT_INFO[unit].ml).toBe(ml);
  });

  it("validates units", () => {
    expect(unitSchema.safeParse("oz").success).toBe(true);
    expect(unitSchema.safeParse("gallon").success).toBe(false);
  });

  it.each<[Unit, boolean]>([
    ["ml", true],
    ["dash", true],
    ["leaf", true],
    ["top", false],
    ["to_taste", false],
  ])("unitNeedsAmount(%s) is %s", (unit, expected) => {
    expect(unitNeedsAmount(unit)).toBe(expected);
  });
});

describe("toMl", () => {
  it("converts every volume unit", () => {
    for (const unit of UNITS) {
      const info = UNIT_INFO[unit];
      expect(toMl(2, unit)).toBe(info.ml === null ? null : 2 * info.ml);
    }
  });

  it("returns null when there is no amount", () => {
    expect(toMl(null, "ml")).toBeNull();
  });
});

describe("convert", () => {
  it("converts between volume units", () => {
    expect(convert(3, "cl", "ml")).toBe(30);
    expect(convert(1, "oz", "ml")).toBe(ML_PER_OZ);
    expect(convert(ML_PER_OZ * 2, "ml", "oz")).toBe(2);
    expect(convert(2, "dash", "ml")).toBeCloseTo(1.8);
  });

  it("refuses non-volume units on either side", () => {
    expect(() => convert(1, "wedge", "ml")).toThrow(RangeError);
    expect(() => convert(1, "ml", "top")).toThrow(RangeError);
  });
});

describe("scale", () => {
  it("multiplies volume amounts", () => {
    expect(scale(30, "ml", 2)).toBe(60);
    expect(scale(0.75, "oz", 3)).toBe(2.25);
  });

  it("removes floating-point noise", () => {
    expect(scale(0.1, "ml", 3)).toBe(0.3);
  });

  it("rounds count units up", () => {
    expect(scale(1, "wedge", 1.5)).toBe(2);
    expect(scale(3, "leaf", 0.5)).toBe(2);
    expect(scale(2, "slice", 1.1 / 1.1)).toBe(2);
  });

  it("keeps null amounts", () => {
    expect(scale(null, "top", 4)).toBeNull();
  });
});

describe("formatAmount", () => {
  describe("as entered", () => {
    it.each<[number, Unit, string]>([
      [45, "ml", "45 ml"],
      [22.5, "ml", "22.5 ml"],
      [7.44, "ml", "7.4 ml"],
      [4.5, "cl", "4.5 cl"],
      [1.5, "oz", "1 ½ oz"],
      [0.75, "oz", "¾ oz"],
      [2, "oz", "2 oz"],
      [1, "tsp", "1 tsp"],
      [1, "barspoon", "1 barspoon"],
      [0.5, "tbsp", "½ tbsp"],
      [1, "dash", "1 dash"],
      [3, "dash", "3 dashes"],
      [2, "drop", "2 drops"],
      [1, "splash", "1 splash"],
      [2, "splash", "2 splashes"],
      [1, "piece", "1 piece"],
      [2, "slice", "2 slices"],
      [0.5, "wedge", "½ wedge"],
      [1, "sprig", "1 sprig"],
      [8, "leaf", "8 leaves"],
      [1.3, "dash", "1.3 dashes"],
      [2, "barspoon", "2 barspoons"],
      [0, "leaf", "0 leaves"],
    ])("%s %s → %s", (amount, unit, expected) => {
      expect(formatAmount(amount, unit)).toBe(expected);
    });
  });

  describe("converted to a display unit", () => {
    it.each<[number, Unit, "ml" | "cl" | "oz", string]>([
      [1.5, "oz", "ml", "44.4 ml"],
      [1.5, "oz", "cl", "4.4 cl"],
      [45, "ml", "oz", "1 ½ oz"],
      [30, "ml", "oz", "1 oz"],
      [22.5, "ml", "oz", "¾ oz"],
      [20, "ml", "oz", "¾ oz"],
      [15, "ml", "oz", "½ oz"],
      [3, "cl", "oz", "1 oz"],
      [60, "ml", "cl", "6 cl"],
      [3, "ml", "oz", "< ¼ oz"],
      [0, "ml", "oz", "0 oz"],
      [45, "ml", "ml", "45 ml"],
    ])("%s %s in %s → %s", (amount, unit, display, expected) => {
      expect(formatAmount(amount, unit, display)).toBe(expected);
    });

    it.each<[number, Unit, string]>([
      [2, "dash", "2 dashes"],
      [1, "barspoon", "1 barspoon"],
      [1, "tsp", "1 tsp"],
      [3, "wedge", "3 wedges"],
    ])("keeps %s %s as entered", (amount, unit, expected) => {
      expect(formatAmount(amount, unit, "oz")).toBe(expected);
    });
  });

  it("shows top and to taste without an amount", () => {
    expect(formatAmount(null, "top")).toBe("Top");
    expect(formatAmount(50, "top", "oz")).toBe("Top");
    expect(formatAmount(null, "to_taste")).toBe("To taste");
  });

  it("shows only the unit when an amount is missing", () => {
    expect(formatAmount(null, "ml", "oz")).toBe("ml");
    expect(formatAmount(null, "dash")).toBe("dash");
  });
});
