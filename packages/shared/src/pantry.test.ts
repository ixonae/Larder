import { describe, expect, it } from "vitest";
import {
  createPantryIngredientSchema,
  listPantryIngredientsQuerySchema,
  updatePantryIngredientSchema,
} from "./pantry.ts";

const ID = "01a1f326-d941-7d74-8a40-504a488cd388";

describe("createPantryIngredientSchema", () => {
  it("needs a trimmed name and a category", () => {
    expect(createPantryIngredientSchema.parse({ name: " Lemon ", category_id: ID })).toEqual({
      name: "Lemon",
      category_id: ID,
    });
  });

  it.each([
    ["a missing name", { category_id: ID }],
    ["a blank name", { name: " ", category_id: ID }],
    ["a long name", { name: "x".repeat(101), category_id: ID }],
    ["a missing category", { name: "x" }],
    ["a bad category id", { name: "x", category_id: "nope" }],
    ["a non-boolean flag", { name: "x", category_id: ID, in_stock: "yes" }],
  ])("refuses %s", (_, input) => {
    expect(createPantryIngredientSchema.safeParse(input).success).toBe(false);
  });
});

describe("updatePantryIngredientSchema", () => {
  it("accepts any single field and refuses an empty patch", () => {
    expect(updatePantryIngredientSchema.parse({ in_stock: true })).toEqual({ in_stock: true });
    expect(updatePantryIngredientSchema.safeParse({}).success).toBe(false);
  });
});

describe("listPantryIngredientsQuerySchema", () => {
  it("defaults to a first page and parses filters", () => {
    expect(listPantryIngredientsQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      listPantryIngredientsQuerySchema.parse({ q: " lem ", category_id: ID, available: "false" }),
    ).toEqual({ limit: 50, q: "lem", category_id: ID, available: false });
    expect(listPantryIngredientsQuerySchema.safeParse({ available: "yes" }).success).toBe(false);
  });
});
