import type { Page, Product } from "@larder/shared";
import { and, count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { barMembers, categories, products } from "../../db/schema/index.ts";
import { createTestApp, errorOf, readJson as json, jsonRequest } from "../../test/app.ts";

const UNKNOWN = "01a1f326-d941-7d74-8a40-504a488cd388";

function setup() {
  const t = createTestApp();
  const bar = (barId: string) => `/api/bars/${barId}`;
  const base = `${bar(t.alice.barId)}/products`;
  const cat = (name: string, barId = t.alice.barId) => {
    const row = t.db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.bar_id, barId), eq(categories.name, name)))
      .get();
    if (!row) throw new Error(`No category ${name}`);
    return row.id;
  };
  const send = (method: string, path: string, body?: unknown) =>
    t.app.request(`${base}${path}`, jsonRequest(method, body));
  const create = async (body: Record<string, unknown>) => {
    const res = await send("POST", "", body);
    expect(res.status).toBe(201);
    return json<Product>(res);
  };
  const names = async (query: string) =>
    (await json<Page<Product>>(await send("GET", query))).items.map((p) => p.name);
  const countRows = (barId = t.alice.barId) =>
    t.db.select({ n: count() }).from(products).where(eq(products.bar_id, barId)).get()?.n ?? 0;
  return { ...t, bar, base, cat, send, create, names, count: countRows };
}

/** A few bottles across the starter tree. */
async function stock(t: ReturnType<typeof setup>) {
  const talisker = await t.create({
    name: "Talisker 10",
    category_id: t.cat("Scotch"),
    producer: "Diageo",
    abv: 45.8,
    age_years: 10,
    in_bar: true,
  });
  const buffalo = await t.create({ name: "Buffalo Trace", category_id: t.cat("Bourbon") });
  const hendricks = await t.create({
    name: "Hendrick's",
    category_id: t.cat("Gin"),
    producer: "William Grant",
    in_bar: true,
  });
  const whisky = await t.create({ name: "Blended whisky", category_id: t.cat("Whisky") });
  return { talisker, buffalo, hendricks, whisky };
}

describe("POST /products", () => {
  it("creates a bottle with defaults and the category name", async () => {
    const t = setup();
    const res = await t.send("POST", "", {
      name: " Grey Goose ",
      category_id: t.cat("Vodka"),
      country: "France",
      region: " ",
    });
    expect(res.status).toBe(201);
    const created = await json<Product>(res);
    expect(created).toMatchObject({
      name: "Grey Goose",
      category_id: t.cat("Vodka"),
      category_name: "Vodka",
      producer: null,
      country: "France",
      region: null,
      abv: null,
      vintage: null,
      age_years: null,
      description: null,
      in_bar: false,
    });
    const row = t.db.select().from(products).where(eq(products.id, created.id)).get();
    expect(row).toMatchObject({ bar_id: t.alice.barId, created_by: t.alice.userId });
  });

  it.each([
    ["an unknown category", { name: "X", category_id: UNKNOWN }],
    ["a missing category", { name: "X" }],
    ["an abv over 100", { name: "X", category_id: UNKNOWN, abv: 101 }],
    ["a fractional vintage", { name: "X", category_id: UNKNOWN, vintage: 2001.5 }],
  ])("refuses %s", async (_, body) => {
    const t = setup();
    const res = await t.send("POST", "", body);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("VALIDATION");
    expect(t.count()).toBe(0);
  });

  it("refuses bottle additions and moves into pantry categories", async () => {
    const t = setup();
    const product = await t.create({
      name: "Bottled orange juice",
      category_id: t.cat("Orange juice"),
    });
    const child = t.db
      .insert(categories)
      .values({
        bar_id: t.alice.barId,
        created_by: t.alice.userId,
        name: "Freezer",
        kind: "other",
        parent_id: t.cat("Pantry"),
      })
      .returning({ id: categories.id })
      .get();
    for (const res of [
      await t.send("POST", "", { name: "Honey syrup", category_id: t.cat("Honey syrup") }),
      await t.send("POST", "", { name: "Orange peel", category_id: t.cat("Garnish") }),
      await t.send("POST", "", { name: "Ice", category_id: t.cat("Pantry") }),
      await t.send("PATCH", `/${product.id}`, { category_id: child.id }),
    ]) {
      expect(res.status).toBe(400);
      expect((await errorOf(res)).details).toEqual([
        {
          path: ["category_id"],
          message: "Choose a bottle category. Track syrups and garnishes in Pantry.",
        },
      ]);
    }
  });

  it("refuses a category from another bar", async () => {
    const t = setup();
    const res = await t.send("POST", "", { name: "X", category_id: t.cat("Gin", t.bob.barId) });
    expect(res.status).toBe(400);
    // Reported on the field, so the bottle form can show it under Category.
    expect(await errorOf(res)).toEqual({
      code: "VALIDATION",
      message: "Category not found",
      details: [{ path: ["category_id"], message: "Category not found" }],
    });
  });

  it("refuses a viewer", async () => {
    const t = setup();
    t.db
      .insert(barMembers)
      .values({ bar_id: t.bob.barId, user_id: t.alice.userId, role: "viewer" })
      .run();
    const bobs = `${t.bar(t.bob.barId)}/products`;
    const body = { name: "X", category_id: t.cat("Gin", t.bob.barId) };
    expect((await t.app.request(bobs, jsonRequest("POST", body))).status).toBe(403);
    expect((await t.app.request(bobs)).status).toBe(200);
  });
});

describe("duplicate names", () => {
  it("refuses the same name ignoring case and accents form, unless the vintage differs", async () => {
    const t = setup();
    const category_id = t.cat("Wine");
    await t.create({ name: "Château Margaux", category_id, vintage: 2015 });
    const nfd = "CHÂTEAU MARGAUX".normalize("NFD");
    const res = await t.send("POST", "", { name: nfd, category_id, vintage: 2015 });
    expect(res.status).toBe(409);
    const message = `A 2015 bottle named "${nfd}" already exists`;
    expect(await errorOf(res)).toEqual({
      code: "CONFLICT",
      message,
      details: [{ path: ["name"], message }],
    });
    await t.create({ name: nfd, category_id, vintage: 2016 });
    await t.create({ name: nfd, category_id });
    const again = await t.send("POST", "", { name: "château margaux", category_id });
    expect(await errorOf(again)).toMatchObject({
      message: 'A bottle named "château margaux" already exists',
    });
    expect(t.count()).toBe(3);
  });

  it("refuses a rename onto an existing name and changes nothing", async () => {
    const t = setup();
    const { buffalo } = await stock(t);
    const res = await t.send("PATCH", `/${buffalo.id}`, { name: "talisker 10", in_bar: true });
    expect(res.status).toBe(409);
    expect(await json(await t.send("GET", `/${buffalo.id}`))).toEqual(buffalo);
  });
});

describe("GET /products", () => {
  it("lists a page sorted by name, walking every page with the cursor", async () => {
    const t = setup();
    await stock(t);
    const first = await json<Page<Product>>(await t.send("GET", "?limit=3"));
    expect(first.items.map((p) => p.name)).toEqual([
      "Blended whisky",
      "Buffalo Trace",
      "Hendrick's",
    ]);
    expect(first.items[1]?.category_name).toBe("Bourbon");
    const second = await json<Page<Product>>(
      await t.send("GET", `?limit=3&cursor=${first.next_cursor}`),
    );
    expect(second).toEqual({
      items: [expect.objectContaining({ name: "Talisker 10" })],
      next_cursor: null,
    });
  });

  it("filters by category including sub-categories, in_bar and search", async () => {
    const t = setup();
    await stock(t);
    expect(await t.names(`?category_id=${t.cat("Whisky")}`)).toEqual([
      "Blended whisky",
      "Buffalo Trace",
      "Talisker 10",
    ]);
    expect(await t.names(`?category_id=${t.cat("Spirit")}&in_bar=true`)).toEqual([
      "Hendrick's",
      "Talisker 10",
    ]);
    expect(await t.names("?in_bar=false")).toEqual(["Blended whisky", "Buffalo Trace"]);
    expect(await t.names("?q=TRACE")).toEqual(["Buffalo Trace"]);
    expect(await t.names("?q=grant")).toEqual(["Hendrick's"]);
    expect(await t.names(`?category_id=${t.cat("Rum")}`)).toEqual([]);
    expect(await t.names(`?category_id=${UNKNOWN}`)).toEqual([]);
  });

  it.each(["?cursor=nope", "?in_bar=yes", "?category_id=nope"])("refuses %s", async (query) => {
    const t = setup();
    const res = await t.send("GET", query);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("VALIDATION");
  });
});

describe("GET /products/:id", () => {
  it("returns one bottle", async () => {
    const t = setup();
    const { talisker } = await stock(t);
    const res = await t.send("GET", `/${talisker.id}`);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(talisker);
  });

  it.each([UNKNOWN, "nope"])("answers 404 for %s", async (id) => {
    const t = setup();
    const res = await t.send("GET", `/${id}`);
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toEqual({ code: "NOT_FOUND", message: "Product not found" });
  });
});

describe("PATCH /products/:id", () => {
  it("changes only the fields sent, including the category", async () => {
    const t = setup();
    const { talisker } = await stock(t);
    const res = await t.send("PATCH", `/${talisker.id}`, {
      category_id: t.cat("Whisky"),
      description: "Peaty",
      producer: "",
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      name: "Talisker 10",
      category_id: t.cat("Whisky"),
      category_name: "Whisky",
      description: "Peaty",
      producer: null,
      abv: 45.8,
      in_bar: true,
    });
  });

  it("accepts the unchanged category alongside other fields, as forms send it", async () => {
    const t = setup();
    const { talisker } = await stock(t);
    const res = await t.send("PATCH", `/${talisker.id}`, {
      category_id: talisker.category_id,
      vintage: 2012,
    });
    expect(await json(res)).toMatchObject({ vintage: 2012 });
  });

  it("refuses a category from another bar and changes nothing", async () => {
    const t = setup();
    const { talisker } = await stock(t);
    const res = await t.send("PATCH", `/${talisker.id}`, {
      name: "Moved",
      category_id: t.cat("Scotch", t.bob.barId),
    });
    expect(res.status).toBe(400);
    expect(await json(await t.send("GET", `/${talisker.id}`))).toEqual(talisker);
  });

  it("refuses an empty patch and answers 404 for an unknown bottle", async () => {
    const t = setup();
    const { talisker } = await stock(t);
    expect((await t.send("PATCH", `/${talisker.id}`, {})).status).toBe(400);
    expect((await t.send("PATCH", `/${UNKNOWN}`, { name: "X" })).status).toBe(404);
  });
});

describe("PATCH /products/:id/in-bar", () => {
  it("sets whether the bottle is in the bar", async () => {
    const t = setup();
    const { buffalo } = await stock(t);
    const on = await t.send("PATCH", `/${buffalo.id}/in-bar`, { in_bar: true });
    expect(on.status).toBe(200);
    expect(await json(on)).toMatchObject({ id: buffalo.id, in_bar: true });
    const off = await t.send("PATCH", `/${buffalo.id}/in-bar`, { in_bar: false });
    expect(await json(off)).toMatchObject({ in_bar: false });
  });

  it("refuses a bad body and answers 404 for an unknown bottle", async () => {
    const t = setup();
    const { buffalo } = await stock(t);
    expect((await t.send("PATCH", `/${buffalo.id}/in-bar`, {})).status).toBe(400);
    expect((await t.send("PATCH", `/${UNKNOWN}/in-bar`, { in_bar: true })).status).toBe(404);
  });
});

describe("DELETE /products/:id", () => {
  it("deletes a bottle", async () => {
    const t = setup();
    const { buffalo } = await stock(t);
    expect((await t.send("DELETE", `/${buffalo.id}`)).status).toBe(204);
    expect(t.count()).toBe(3);
    expect((await t.send("GET", `/${buffalo.id}`)).status).toBe(404);
  });

  it("answers 404 for an unknown bottle", async () => {
    const t = setup();
    expect((await t.send("DELETE", `/${UNKNOWN}`)).status).toBe(404);
  });
});

describe("deleting a category used by bottles", () => {
  it("is refused, lists the bottles and deletes nothing", async () => {
    const t = setup();
    const { talisker } = await stock(t);
    const res = await t.app.request(
      `${t.bar(t.alice.barId)}/categories/${t.cat("Scotch")}`,
      jsonRequest("DELETE"),
    );
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({
      code: "CONFLICT",
      message: '"Scotch" still has bottles',
      details: { used_by: [{ type: "product", id: talisker.id, name: "Talisker 10" }] },
    });
    expect(t.cat("Scotch")).toBeTruthy();
    expect(t.count()).toBe(4);
  });

  it("lists sub-categories and bottles together", async () => {
    const t = setup();
    await stock(t);
    const res = await t.app.request(
      `${t.bar(t.alice.barId)}/categories/${t.cat("Whisky")}`,
      jsonRequest("DELETE"),
    );
    const error = await errorOf(res);
    expect(error.message).toBe('"Whisky" still has sub-categories and bottles');
    expect((error.details as { used_by: { type: string }[] }).used_by.at(-1)).toMatchObject({
      type: "product",
    });
  });
});

describe("cross-bar isolation", () => {
  it("cannot read or change another bar's bottles", async () => {
    const t = setup();
    await stock(t);
    const bobsUrl = `${t.bar(t.bob.barId)}/products`;
    const bobs = t.db
      .insert(products)
      .values({
        bar_id: t.bob.barId,
        created_by: t.bob.userId,
        name: "Talisker 10",
        category_id: t.cat("Scotch", t.bob.barId),
      })
      .returning({ id: products.id })
      .get().id;
    // Through Alice's bar, Bob's bottle does not exist.
    expect((await t.send("GET", `/${bobs}`)).status).toBe(404);
    expect((await t.send("PATCH", `/${bobs}`, { name: "Mine" })).status).toBe(404);
    expect((await t.send("PATCH", `/${bobs}/in-bar`, { in_bar: true })).status).toBe(404);
    expect((await t.send("DELETE", `/${bobs}`)).status).toBe(404);
    // Through Bob's bar, Alice is not a member.
    expect((await t.app.request(bobsUrl)).status).toBe(403);
    expect((await t.app.request(`${bobsUrl}/${bobs}`, { method: "DELETE" })).status).toBe(403);
    // Lists only show Alice's own bottles, even when filtering by Bob's category.
    expect(await t.names("?q=talisker")).toEqual(["Talisker 10"]);
    expect(await t.names(`?category_id=${t.cat("Scotch", t.bob.barId)}`)).toEqual([]);
    expect(t.count(t.bob.barId)).toBe(1);
    const row = t.db.select().from(products).where(eq(products.id, bobs)).get();
    expect(row).toMatchObject({ name: "Talisker 10", in_bar: false });
  });
});
