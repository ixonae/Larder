import { describe, expect, test } from "vitest";
import {
  buildInventory,
  type Inventory,
  isAvailable,
  type MakeabilityLine,
  makeability,
  matchingBottles,
  type StockSource,
} from "./makeability.ts";

type StockBottle = Parameters<typeof buildInventory>[1][number];

// Spirit › Gin › London dry, plus Juice › Lemon juice and a Pantry group.
const categories = [
  { id: "spirit", parent_id: null },
  { id: "gin", parent_id: "spirit" },
  { id: "london", parent_id: "gin" },
  { id: "rum", parent_id: "spirit" },
  { id: "juice", parent_id: null },
  { id: "lemon-juice", parent_id: "juice" },
  { id: "pantry", parent_id: null },
];
// Inventories take only what is available: bottles in the bar and available pantry ingredient ids.
const bottle = (id: string, category_id: string): StockBottle => ({ id, name: id, category_id });

const category = (id: string): StockSource => ({
  category_id: id,
  product_id: null,
  pantry_ingredient_id: null,
});
const product = (id: string): StockSource => ({
  category_id: null,
  product_id: id,
  pantry_ingredient_id: null,
});
const pantry = (id: string): StockSource => ({
  category_id: null,
  product_id: null,
  pantry_ingredient_id: id,
});
const line = (
  id: string,
  source: StockSource,
  {
    optional = false,
    alternatives = [],
  }: { optional?: boolean; alternatives?: StockSource[] } = {},
): MakeabilityLine => ({
  ...source,
  id,
  name: id,
  optional,
  alternatives: alternatives.map((alt, index) => ({ ...alt, name: `${id} alt ${index}` })),
});

describe("isAvailable", () => {
  const inventory = buildInventory(categories, [bottle("tanqueray", "london")], ["lemon", "ice"]);

  test("a named product must be in the bar", () => {
    expect(isAvailable(product("tanqueray"), inventory)).toBe(true);
    expect(isAvailable(product("unknown"), inventory)).toBe(false);
  });

  test("a category matches an owned product in it or any sub-category, never above it", () => {
    expect(isAvailable(category("london"), inventory)).toBe(true);
    expect(isAvailable(category("gin"), inventory)).toBe(true);
    expect(isAvailable(category("spirit"), inventory)).toBe(true);
    expect(isAvailable(category("rum"), inventory)).toBe(false);
    expect(isAvailable(category("juice"), inventory)).toBe(false);
  });

  test("a pantry ingredient must be available", () => {
    expect(isAvailable(pantry("lemon"), inventory)).toBe(true);
    expect(isAvailable(pantry("ice"), inventory)).toBe(true);
    expect(isAvailable(pantry("egg"), inventory)).toBe(false);
    expect(isAvailable(pantry("unknown"), inventory)).toBe(false);
  });

  test("a source with no reference is never available", () => {
    expect(
      isAvailable({ category_id: null, product_id: null, pantry_ingredient_id: null }, inventory),
    ).toBe(false);
  });

  describe("always-available categories", () => {
    const flagged = (...ids: string[]): Inventory =>
      buildInventory(
        categories.map((item) => ({ ...item, always_available: ids.includes(item.id) })),
        [],
        [],
      );

    test("count for themselves and every category above them, never below", () => {
      const inventory = flagged("gin");
      expect(isAvailable(category("gin"), inventory)).toBe(true);
      expect(isAvailable(category("spirit"), inventory)).toBe(true);
      expect(isAvailable(category("london"), inventory)).toBe(false);
      expect(isAvailable(category("rum"), inventory)).toBe(false);
    });

    test("do not satisfy a named product or pantry ingredient, and match no bottle", () => {
      const inventory = flagged("gin", "pantry");
      expect(isAvailable(product("tanqueray"), inventory)).toBe(false);
      expect(isAvailable(pantry("lemon"), inventory)).toBe(false);
      expect(matchingBottles(category("gin"), inventory)).toEqual([]);
    });

    test("satisfy a line through an alternative", () => {
      const lines = [line("rum", category("rum"), { alternatives: [category("london")] })];
      expect(makeability(lines, flagged())).toHaveLength(1);
      expect(makeability(lines, flagged("london"))).toEqual([]);
    });

    test("a flagged category whose parent is missing counts only for itself", () => {
      const inventory = buildInventory(
        [{ id: "lost", parent_id: "gone", always_available: true }],
        [],
        [],
      );
      expect(isAvailable(category("lost"), inventory)).toBe(true);
      expect(isAvailable(category("gone"), inventory)).toBe(false);
    });
  });

  test("a product in a category missing from the tree still counts for its own category", () => {
    const orphan = buildInventory([], [bottle("odd", "lost")], []);
    expect(isAvailable(category("lost"), orphan)).toBe(true);
    expect(isAvailable(product("odd"), orphan)).toBe(true);
  });
});

describe("makeability", () => {
  const stock = (products: StockBottle[], supplies: string[]): Inventory =>
    buildInventory(categories, products, supplies);

  test("reports each unsatisfied required line once, in recipe order, with its substitutes", () => {
    const lines = [
      line("gin", category("gin")),
      line("rum", category("rum"), { alternatives: [product("plantation")] }),
      line("egg", pantry("egg")),
    ];
    expect(makeability(lines, stock([bottle("tanqueray", "london")], []))).toEqual([
      { id: "rum", name: "rum", alternatives: ["rum alt 0"] },
      { id: "egg", name: "egg", alternatives: [] },
    ]);
  });

  test("nothing is missing for an empty recipe or when everything is there", () => {
    expect(makeability([], stock([], []))).toEqual([]);
    expect(
      makeability(
        [line("gin", category("gin")), line("lemon", pantry("lemon"))],
        stock([bottle("tanqueray", "london")], ["lemon"]),
      ),
    ).toEqual([]);
  });

  test("optional lines are ignored, such as a garnish", () => {
    const lines = [line("mint", pantry("mint"), { optional: true })];
    expect(makeability(lines, stock([], []))).toEqual([]);
  });

  test("required blending ice is missing until ice is available", () => {
    const lines = [line("ice", pantry("ice"))];
    expect(makeability(lines, stock([], []))).toEqual([
      { id: "ice", name: "ice", alternatives: [] },
    ]);
    expect(makeability(lines, stock([], ["ice"]))).toEqual([]);
  });

  test("a line is satisfied by any one alternative, whatever its kind", () => {
    const lines = [
      line("rum", category("rum"), {
        alternatives: [pantry("egg"), product("tanqueray"), category("juice")],
      }),
    ];
    expect(makeability(lines, stock([bottle("tanqueray", "london")], []))).toEqual([]);
  });

  test("a named product line is not satisfied by another bottle of its category", () => {
    const lines = [line("specific", product("hendricks"))];
    expect(makeability(lines, stock([bottle("tanqueray", "london")], []))).toHaveLength(1);
  });

  describe("a juice line that accepts fresh or bottled, and a twist", () => {
    const juice = line("juice", pantry("lemon"), { alternatives: [category("lemon-juice")] });
    const freshOnly = line("fresh juice", pantry("lemon"));
    const twist = line("twist", pantry("lemon"));
    const bottled = bottle("realemon", "lemon-juice");
    const lemon = "lemon";

    test.each([
      ["fresh only", [], [lemon], []],
      ["bottle only", [bottled], [], ["fresh juice", "twist"]],
      ["both", [bottled], [lemon], []],
      ["neither", [], [], ["juice", "fresh juice", "twist"]],
    ])("%s", (_label, products, supplies, missing) => {
      const result = makeability([juice, freshOnly, twist], stock(products, supplies));
      expect(result.map(({ id }) => id)).toEqual(missing);
    });
  });
});

test("matchingBottles lists owned bottles in a category or below it, in the given order", () => {
  const inventory = buildInventory(
    categories,
    [bottle("beefeater", "london"), bottle("tanqueray", "gin"), bottle("plantation", "rum")],
    [],
  );
  expect(matchingBottles(category("gin"), inventory)).toEqual([
    { id: "beefeater", name: "beefeater" },
    { id: "tanqueray", name: "tanqueray" },
  ]);
  expect(matchingBottles(category("spirit"), inventory)).toHaveLength(3);
  expect(matchingBottles(category("london"), inventory)).toEqual([
    { id: "beefeater", name: "beefeater" },
  ]);
  expect(matchingBottles(category("juice"), inventory)).toEqual([]);
  expect(matchingBottles(product("tanqueray"), inventory)).toEqual([]);
});
