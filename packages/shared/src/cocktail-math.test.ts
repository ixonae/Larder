import { expect, test } from "vitest";
import type { CategoryKind } from "./categories.ts";
import { computeAbv, computeVolume, scaleRecipe, spiritsContained } from "./cocktail-math.ts";
import type { Unit } from "./units.ts";

const line = (amount: number | null, unit: Unit, abv = 0, optional = false) => ({
  amount,
  unit,
  abv,
  optional,
});

test("adds measured volumes in ml and lets callers opt in to optional pours", () => {
  const lines = [
    line(2, "cl"),
    line(1, "oz"),
    line(2, "dash"),
    line(1, "drop"),
    line(2, "piece"),
    line(null, "top"),
    line(9, "to_taste"),
    line(10, "ml", 0, true),
  ];
  expect(computeVolume(lines)).toBeCloseTo(51.4235);
  expect(computeVolume(lines, true)).toBeCloseTo(61.4235);
  expect(computeVolume([])).toBe(0);
});

test.each([
  ["shaken", 1.25],
  ["stirred", 1.2],
  ["thrown", 1.15],
  ["blended", 1.3],
  ["built", 1.1],
  ["other", 1],
] as const)("weights ABV by volume and applies %s dilution", (method, dilution) => {
  const lines = [line(1, "cl", 40), line(30, "ml"), line(10, "ml", 100, true)];
  expect(computeAbv(lines, method)).toBeCloseTo(10 / dilution);
  expect(computeAbv(lines, method, true)).toBeCloseTo(28 / dilution);
});

test("returns zero ABV when there is no measured liquid", () => {
  expect(computeAbv([line(null, "top", 40), line(2, "leaf", 80)], "built")).toBe(0);
});

test("reports each preferred spirit family once, including a spirit used at its root", () => {
  const category = (name: string, kind: CategoryKind = "spirit") => ({ id: name, name, kind });
  const spirit = category("Spirit");
  const whisky = category("Whisky");
  const vodka = category("Vodka");
  expect(
    spiritsContained(
      [
        [spirit, whisky, category("Scotch"), category("Islay")],
        [spirit, whisky, category("Rye")],
        [category("Wine", "wine")],
        [spirit, category("Non-spirit", "other")],
        [spirit, vodka],
        [spirit],
      ].map((category_path) => ({ category_path })),
    ),
  ).toEqual([whisky, vodka, spirit].map(({ id, name }) => ({ id, name })));
});

test("scales the preferred quantity once, rounds counts up and leaves the input intact", () => {
  const alternatives = [{ note: "Chill first" }];
  const lines = [
    { ...line(25, "ml"), alternatives },
    line(3, "piece", 0, true),
    line(null, "to_taste"),
    line(1, "dash"),
  ];
  expect(scaleRecipe(lines, 2, 1)).toEqual([
    { ...line(12.5, "ml"), alternatives },
    line(2, "piece", 0, true),
    line(null, "to_taste"),
    line(0.5, "dash"),
  ]);
  expect(lines.map(({ amount }) => amount)).toEqual([25, 3, null, 1]);
});
