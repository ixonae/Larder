import { describe, expect, it } from "vitest";
import {
  createTastingSchema,
  listTastingsQuerySchema,
  tastingSchema,
  updateTastingSchema,
} from "./tastings.ts";

const ID = "01a1f326-d941-7d74-8a40-504a488cd388";

describe("createTastingSchema", () => {
  it("needs only the day and stores blank text as null", () => {
    expect(createTastingSchema.parse({ tasted_on: "2026-11-01" })).toEqual({
      tasted_on: "2026-11-01",
    });
    expect(
      createTastingSchema.parse({
        tasted_on: "2026-11-01",
        score: null,
        notes: " ",
        location: " Bar ",
      }),
    ).toEqual({ tasted_on: "2026-11-01", score: null, notes: null, location: "Bar" });
  });

  it.each([
    {},
    { tasted_on: "01/11/2026" },
    { tasted_on: "2026-11-01", score: 0 },
    { tasted_on: "2026-11-01", score: 6 },
    { tasted_on: "2026-11-01", score: 2.5 },
  ])("refuses %o", (body) => {
    expect(createTastingSchema.safeParse(body).success).toBe(false);
  });
});

describe("updateTastingSchema", () => {
  it("needs at least one field", () => {
    expect(updateTastingSchema.safeParse({}).success).toBe(false);
    expect(updateTastingSchema.parse({ score: null })).toEqual({ score: null });
  });
});

describe("listTastingsQuerySchema", () => {
  it("parses filters from the query string", () => {
    expect(
      listTastingsQuerySchema.parse({
        category_id: ID,
        score_min: "2",
        score_max: "4",
        from: "2026-01-01",
        mine: "true",
      }),
    ).toEqual({
      limit: 50,
      category_id: ID,
      score_min: 2,
      score_max: 4,
      from: "2026-01-01",
      mine: true,
    });
  });

  it.each([{ score_min: "0" }, { score_max: "6" }, { to: "soon" }, { product_id: "x" }])(
    "refuses %o",
    (query) => {
      expect(listTastingsQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});

describe("tastingSchema", () => {
  it("validates a journal entry", () => {
    const tasting = {
      id: ID,
      product_id: ID,
      tasted_on: "2026-11-01",
      score: null,
      notes: null,
      location: null,
      is_private: true,
      author: { id: ID, display_name: "Alice" },
      product: {
        id: ID,
        name: "Talisker",
        image_id: null,
        category_id: ID,
        category_name: "Scotch",
        status: "tasted",
      },
      can_delete: true,
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-01T00:00:00.000Z",
    };
    expect(tastingSchema.parse(tasting)).toEqual(tasting);
  });
});
