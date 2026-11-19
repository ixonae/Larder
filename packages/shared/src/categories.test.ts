import { describe, expect, it } from "vitest";
import {
  categoryTreeSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from "./categories.ts";
import { usedBySchema } from "./errors.ts";

const ID = "01a1f326-d941-7d74-8a40-504a488cd388";

describe("createCategorySchema", () => {
  it("needs only a name, trimmed", () => {
    expect(createCategorySchema.parse({ name: "  Gin " })).toEqual({ name: "Gin" });
  });

  it.each([
    ["a missing name", {}],
    ["a blank name", { name: "   " }],
    ["a long name", { name: "x".repeat(101) }],
    ["an unknown kind", { name: "x", kind: "soda" }],
    ["an abv over 100", { name: "x", default_abv: 101 }],
    ["a negative abv", { name: "x", default_abv: -1 }],
    ["a bad parent id", { name: "x", parent_id: "nope" }],
    ["a long description", { name: "x", description: "x".repeat(2001) }],
  ])("refuses %s", (_, input) => {
    expect(createCategorySchema.safeParse(input).success).toBe(false);
  });

  it("stores a blank description as null", () => {
    expect(createCategorySchema.parse({ name: "x", description: "  " }).description).toBeNull();
    expect(createCategorySchema.parse({ name: "x", description: " Hi " }).description).toBe("Hi");
  });
});

describe("updateCategorySchema", () => {
  it("accepts any single field", () => {
    expect(updateCategorySchema.parse({ parent_id: null })).toEqual({ parent_id: null });
  });

  it("refuses an empty patch", () => {
    expect(updateCategorySchema.safeParse({}).success).toBe(false);
  });
});

describe("listCategoriesQuerySchema", () => {
  it("defaults to a flat first page", () => {
    expect(listCategoriesQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it("accepts filters", () => {
    expect(listCategoriesQuerySchema.parse({ q: " gin ", kind: "spirit", parent_id: ID })).toEqual({
      limit: 50,
      q: "gin",
      kind: "spirit",
      parent_id: ID,
    });
  });

  it.each([{ q: "" }, { kind: "soda" }, { parent_id: "nope" }])("refuses %o", (query) => {
    expect(listCategoriesQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("categoryTreeSchema", () => {
  const node = {
    id: ID,
    name: "Spirit",
    parent_id: null,
    kind: "spirit",
    default_abv: 40,
    description: null,
    image_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  it("validates nested children", () => {
    const tree = { items: [{ ...node, children: [{ ...node, parent_id: ID, children: [] }] }] };
    expect(categoryTreeSchema.parse(tree)).toEqual(tree);
    const broken = { items: [{ ...node, children: [{ ...node, children: [{}] }] }] };
    expect(categoryTreeSchema.safeParse(broken).success).toBe(false);
  });
});

describe("usedBySchema", () => {
  it("describes what uses an item", () => {
    const details = { used_by: [{ type: "category", id: ID, name: "Gin" }] };
    expect(usedBySchema.parse(details)).toEqual(details);
    expect(usedBySchema.safeParse({ used_by: [{ type: "x", id: ID, name: "" }] }).success).toBe(
      false,
    );
  });
});
