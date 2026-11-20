import { describe, expect, it } from "vitest";
import {
  createProductSchema,
  listProductsQuerySchema,
  productSchema,
  setProductStatusSchema,
  updateProductSchema,
} from "./products.ts";

const ID = "01a1f326-d941-7d74-8a40-504a488cd388";

describe("createProductSchema", () => {
  it("needs a name and a category, trimmed", () => {
    expect(createProductSchema.parse({ name: " Talisker ", category_id: ID })).toEqual({
      name: "Talisker",
      category_id: ID,
    });
  });

  it("stores blank text as null", () => {
    const parsed = createProductSchema.parse({
      name: "x",
      category_id: ID,
      producer: " ",
      country: "GB",
      region: "",
      description: "  ",
    });
    expect(parsed).toMatchObject({
      producer: null,
      country: "GB",
      region: null,
      description: null,
    });
  });

  it("accepts an ISO country code or null, and refuses anything else", () => {
    const parse = (country: unknown) =>
      createProductSchema.safeParse({ name: "x", category_id: ID, country });
    expect(parse("JP")).toMatchObject({ success: true, data: { country: "JP" } });
    expect(parse(null)).toMatchObject({ success: true, data: { country: null } });
    for (const bad of ["jp", "Japan", "Scotland", "XX", ""]) expect(parse(bad).success).toBe(false);
  });

  it.each([
    ["a missing name", { category_id: ID }],
    ["a missing category", { name: "x" }],
    ["a bad category id", { name: "x", category_id: "nope" }],
    ["a long name", { name: "x".repeat(201), category_id: ID }],
    ["a long producer", { name: "x", category_id: ID, producer: "x".repeat(101) }],
    ["a negative abv", { name: "x", category_id: ID, abv: -1 }],
    ["an old vintage", { name: "x", category_id: ID, vintage: 1799 }],
    ["a far vintage", { name: "x", category_id: ID, vintage: 2201 }],
    ["a fractional age", { name: "x", category_id: ID, age_years: 1.5 }],
    ["a negative age", { name: "x", category_id: ID, age_years: -1 }],
  ])("refuses %s", (_, input) => {
    expect(createProductSchema.safeParse(input).success).toBe(false);
  });
});

describe("updateProductSchema", () => {
  it("accepts any single field and refuses an empty patch", () => {
    expect(updateProductSchema.parse({ vintage: null })).toEqual({ vintage: null });
    expect(updateProductSchema.safeParse({}).success).toBe(false);
  });
});

describe("setProductStatusSchema", () => {
  it("needs a known status", () => {
    expect(setProductStatusSchema.parse({ status: "want_to_try" })).toEqual({
      status: "want_to_try",
    });
    expect(setProductStatusSchema.parse({ status: null })).toEqual({ status: null });
    expect(setProductStatusSchema.safeParse({ status: "stocked" }).success).toBe(false);
  });
});

describe("listProductsQuerySchema", () => {
  it("defaults to a first page", () => {
    expect(listProductsQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it("parses filters", () => {
    expect(listProductsQuerySchema.parse({ q: " gin ", category_id: ID, status: "owned" })).toEqual(
      { limit: 50, q: "gin", category_id: ID, status: ["owned"] },
    );
    expect(listProductsQuerySchema.parse({ status: "want_to_buy,want_to_try" }).status).toEqual([
      "want_to_buy",
      "want_to_try",
    ]);
    expect(listProductsQuerySchema.parse({ country: "JP" }).country).toBe("JP");
  });

  it.each([
    { q: "" },
    { status: "yes" },
    { status: "" },
    { category_id: "nope" },
    { country: "jp" },
    { country: "" },
  ])("refuses %o", (query) => {
    expect(listProductsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("productSchema", () => {
  it("validates a bottle", () => {
    const product = {
      id: ID,
      name: "Talisker 10",
      category_id: ID,
      category_name: "Scotch",
      producer: null,
      country: null,
      region: null,
      abv: 45.8,
      vintage: null,
      age_years: 10,
      description: null,
      image_id: null,
      status: "owned",
      stock: {
        open_count: 1,
        total_count: 2,
        last_bought_on: "2026-11-01",
        last_finished_on: null,
      },
      tasting_summary: { count: 2, avg_score: 4.5, last_tasted_on: "2026-11-02" },
      is_favourite: false,
      comment_count: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    expect(productSchema.parse(product)).toEqual(product);
    expect(productSchema.parse({ ...product, status: null }).status).toBeNull();
    expect(productSchema.safeParse({ ...product, status: "wished" }).success).toBe(false);
  });
});
