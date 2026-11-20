import { describe, expect, it } from "vitest";
import {
  createPurchaseSchema,
  finishProductSchema,
  MAX_PURCHASE_COUNT,
  purchaseSchema,
  updatePurchaseSchema,
} from "./purchases.ts";

const ID = "01a1f326-d941-7d74-8a40-504a488cd388";

describe("createPurchaseSchema", () => {
  it("needs a date, buys one bottle by default and stores blank text as null", () => {
    expect(createPurchaseSchema.parse({ bought_on: "2026-11-20", store: " " })).toEqual({
      bought_on: "2026-11-20",
      store: null,
      count: 1,
    });
  });

  it("accepts a price per bottle in minor units with a currency", () => {
    const input = { bought_on: "2026-11-20", price_minor: 1999, currency: "USD", count: 2 };
    expect(createPurchaseSchema.parse(input)).toEqual(input);
  });

  it.each([
    {},
    { bought_on: "20/11/2026" },
    { bought_on: "2026-11-20", count: 0 },
    { bought_on: "2026-11-20", count: MAX_PURCHASE_COUNT + 1 },
    { bought_on: "2026-11-20", count: 1.5 },
    { bought_on: "2026-11-20", price_minor: -1 },
    { bought_on: "2026-11-20", price_minor: 1.5 },
    { bought_on: "2026-11-20", currency: "usd" },
  ])("refuses %o", (input) => {
    expect(createPurchaseSchema.safeParse(input).success).toBe(false);
  });
});

describe("updatePurchaseSchema", () => {
  it("accepts a single field, including clearing finished_on, and refuses an empty patch", () => {
    expect(updatePurchaseSchema.parse({ finished_on: null })).toEqual({ finished_on: null });
    expect(updatePurchaseSchema.safeParse({}).success).toBe(false);
  });
});

describe("finishProductSchema", () => {
  it("takes an optional date", () => {
    expect(finishProductSchema.parse({})).toEqual({});
    expect(finishProductSchema.safeParse({ finished_on: "today" }).success).toBe(false);
  });
});

describe("purchaseSchema", () => {
  it("validates a purchase", () => {
    const purchase = {
      id: ID,
      product_id: ID,
      bought_on: "2026-11-01",
      price_minor: 4500,
      currency: "JPY",
      store: null,
      notes: null,
      finished_on: null,
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-01T00:00:00.000Z",
    };
    expect(purchaseSchema.parse(purchase)).toEqual(purchase);
  });
});
