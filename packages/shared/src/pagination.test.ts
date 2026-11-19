import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  pageSchema,
  paginationQuerySchema,
} from "./pagination.ts";

describe("paginationQuerySchema", () => {
  it("applies the default limit", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: DEFAULT_PAGE_LIMIT });
  });

  it("coerces query-string values", () => {
    expect(paginationQuerySchema.parse({ limit: "10", cursor: "abc" })).toEqual({
      limit: 10,
      cursor: "abc",
    });
  });

  it.each([0, -1, 1.5, MAX_PAGE_LIMIT + 1, "x"])("rejects limit %s", (limit) => {
    expect(paginationQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it("rejects an empty cursor", () => {
    expect(paginationQuerySchema.safeParse({ cursor: "" }).success).toBe(false);
  });
});

describe("pageSchema", () => {
  const schema = pageSchema(z.object({ id: z.string() }));

  it("accepts a page with a next cursor", () => {
    const page = { items: [{ id: "a" }], next_cursor: "a" };
    expect(schema.parse(page)).toEqual(page);
  });

  it("accepts the last page", () => {
    expect(schema.parse({ items: [], next_cursor: null }).next_cursor).toBeNull();
  });

  it("validates items", () => {
    expect(schema.safeParse({ items: [{ id: 1 }], next_cursor: null }).success).toBe(false);
  });
});
