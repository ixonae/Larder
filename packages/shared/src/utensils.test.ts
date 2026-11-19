import { describe, expect, it } from "vitest";
import {
  createUtensilSchema,
  listUtensilsQuerySchema,
  updateUtensilSchema,
  utensilSchema,
} from "./utensils.ts";

const ID = "01a1f326-d941-7d74-8a40-504a488cd388";

describe("createUtensilSchema", () => {
  it("needs a name and a kind, trimmed, and stores a blank description as null", () => {
    expect(
      createUtensilSchema.parse({
        name: " Coupe ",
        kind: "glass",
        capacity_ml: 180,
        description: " ",
      }),
    ).toEqual({ name: "Coupe", kind: "glass", capacity_ml: 180, description: null });
  });

  it.each([
    ["a missing name", { kind: "tool" }],
    ["a missing kind", { name: "x" }],
    ["an unknown kind", { name: "x", kind: "plate" }],
    ["a long name", { name: "x".repeat(101), kind: "tool" }],
    ["a zero capacity", { name: "x", kind: "glass", capacity_ml: 0 }],
    ["a huge capacity", { name: "x", kind: "glass", capacity_ml: 5001 }],
  ])("refuses %s", (_, input) => {
    expect(createUtensilSchema.safeParse(input).success).toBe(false);
  });
});

describe("updateUtensilSchema", () => {
  it("accepts any single field and refuses an empty patch", () => {
    expect(updateUtensilSchema.parse({ capacity_ml: null })).toEqual({ capacity_ml: null });
    expect(updateUtensilSchema.safeParse({}).success).toBe(false);
  });
});

describe("listUtensilsQuerySchema", () => {
  it("defaults to a first page and parses filters", () => {
    expect(listUtensilsQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(listUtensilsQuerySchema.parse({ q: " cou ", kind: "glass" })).toEqual({
      limit: 50,
      q: "cou",
      kind: "glass",
    });
  });

  it.each([{ q: "" }, { kind: "plate" }])("refuses %o", (query) => {
    expect(listUtensilsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("utensilSchema", () => {
  it("validates a utensil", () => {
    const utensil = {
      id: ID,
      name: "Coupe",
      kind: "glass",
      capacity_ml: 180,
      description: null,
      image_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    expect(utensilSchema.parse(utensil)).toEqual(utensil);
    expect(utensilSchema.safeParse({ ...utensil, kind: "plate" }).success).toBe(false);
  });
});
