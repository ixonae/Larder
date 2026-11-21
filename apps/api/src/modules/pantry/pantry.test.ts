import type { Page, PantryIngredient } from "@larder/shared";
import { and, count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { barMembers, categories, pantryIngredients, products } from "../../db/schema/index.ts";
import {
  createTestApp,
  errorOf,
  readJson as json,
  jsonRequest,
  type TestApp,
} from "../../test/app.ts";

const UNKNOWN = "01a1f326-d941-7d74-8a40-504a488cd388";

function setup(): TestApp & {
  bar: (barId: string) => string;
  base: string;
  cat: (name: string, barId?: string) => string;
  ing: (name: string, barId?: string) => string;
  send: (method: string, path: string, body?: unknown) => Response | Promise<Response>;
  names: (query: string) => Promise<string[]>;
  count: () => number;
} {
  const t = createTestApp();
  const bar = (barId: string): string => `/api/bars/${barId}`;
  const base = `${bar(t.alice.barId)}/pantry-ingredients`;
  const cat = (name: string, barId: string = t.alice.barId): string => {
    const row = t.db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.bar_id, barId), eq(categories.name, name)))
      .get();
    if (!row) throw new Error(`No category ${name}`);
    return row.id;
  };
  const ing = (name: string, barId: string = t.alice.barId): string => {
    const row = t.db
      .select({ id: pantryIngredients.id })
      .from(pantryIngredients)
      .where(and(eq(pantryIngredients.bar_id, barId), eq(pantryIngredients.name, name)))
      .get();
    if (!row) throw new Error(`No ingredient ${name}`);
    return row.id;
  };
  const send = (method: string, path: string, body?: unknown): Response | Promise<Response> =>
    t.app.request(`${base}${path}`, jsonRequest(method, body));
  const names = async (query: string): Promise<string[]> =>
    (await json<Page<PantryIngredient>>(await send("GET", query))).items.map((i) => i.name);
  const countRows = (): number =>
    t.db
      .select({ n: count() })
      .from(pantryIngredients)
      .where(eq(pantryIngredients.bar_id, t.alice.barId))
      .get()?.n ?? 0;
  return { ...t, bar, base, cat, ing, send, names, count: countRows };
}

describe("GET /pantry-ingredients", () => {
  it("lists the starter ingredients sorted by name, with their category", async () => {
    const t = setup();
    const page = await json<Page<PantryIngredient>>(await t.send("GET", "?limit=3"));
    expect(page.items.map((i) => i.name)).toEqual(["Egg", "Egg white", "Ice"]);
    expect(page.items[2]).toMatchObject({
      category_id: t.cat("Pantry"),
      category_name: "Pantry",
      in_stock: false,
      always_available: true,
    });
    const next = await t.names(`?limit=3&cursor=${page.next_cursor}`);
    expect(next).toEqual(["Lemon", "Lime", "Mint"]);
  });

  it("filters by name, category (with sub-categories) and availability", async () => {
    const t = setup();
    const sub = await json<{ id: string }>(
      await t.app.request(
        `${t.bar(t.alice.barId)}/categories`,
        jsonRequest("POST", { name: "Citrus", parent_id: t.cat("Garnish") }),
      ),
    );
    await t.send("POST", "", { name: "Yuzu", category_id: sub.id, in_stock: true });
    expect(await t.names("?q=EGG")).toEqual(["Egg", "Egg white"]);
    expect(await t.names(`?category_id=${t.cat("Garnish")}`)).toEqual([
      "Lemon",
      "Lime",
      "Mint",
      "Orange",
      "Yuzu",
    ]);
    expect(await t.names(`?category_id=${sub.id}`)).toEqual(["Yuzu"]);
    expect(await t.names("?available=true")).toEqual(["Ice", "Sugar", "Water", "Yuzu"]);
    expect(await t.names("?available=false&q=e")).toEqual([
      "Egg",
      "Egg white",
      "Lemon",
      "Lime",
      "Orange",
    ]);
  });

  it.each(["?cursor=nope", "?available=yes", "?category_id=nope"])("refuses %s", async (q) => {
    const t = setup();
    const res = await t.send("GET", q);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("VALIDATION");
  });
});

describe("GET /pantry-ingredients/:id", () => {
  it("returns one ingredient", async () => {
    const t = setup();
    const res = await t.send("GET", `/${t.ing("Lemon")}`);
    expect(await json(res)).toMatchObject({ name: "Lemon", category_name: "Garnish" });
  });

  it.each([UNKNOWN, "nope"])("answers 404 for %s", async (id) => {
    const t = setup();
    const res = await t.send("GET", `/${id}`);
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toEqual({ code: "NOT_FOUND", message: "Ingredient not found" });
  });
});

describe("POST /pantry-ingredients", () => {
  it("creates an ingredient, out of stock by default", async () => {
    const t = setup();
    const res = await t.send("POST", "", { name: " Honey ", category_id: t.cat("Pantry") });
    expect(res.status).toBe(201);
    const created = await json<PantryIngredient>(res);
    expect(created).toMatchObject({
      name: "Honey",
      category_id: t.cat("Pantry"),
      category_name: "Pantry",
      in_stock: false,
      always_available: false,
    });
    const row = t.db
      .select()
      .from(pantryIngredients)
      .where(eq(pantryIngredients.id, created.id))
      .get();
    expect(row).toMatchObject({ bar_id: t.alice.barId, created_by: t.alice.userId });
  });

  it("accepts syrup in Pantry and refuses bottle categories for additions or moves", async () => {
    const t = setup();
    const syrup = await t.send("POST", "", { name: "Maple syrup", category_id: t.cat("Syrup") });
    expect(syrup.status).toBe(201);
    const { id } = await json<PantryIngredient>(syrup);
    const category_id = t.cat("Gin");
    for (const res of [
      await t.send("POST", "", { name: "Gin", category_id }),
      await t.send("POST", "", { name: "Packaged juice", category_id: t.cat("Orange juice") }),
      await t.send("PATCH", `/${id}`, { category_id }),
    ]) {
      expect(res.status).toBe(400);
      expect((await errorOf(res)).details).toEqual([
        { path: ["category_id"], message: "Choose a category for pantry ingredients" },
      ]);
    }
  });

  it("accepts both flags", async () => {
    const t = setup();
    const res = await t.send("POST", "", {
      name: "Pepper",
      category_id: t.cat("Pantry"),
      in_stock: true,
      always_available: true,
    });
    expect(await json(res)).toMatchObject({ in_stock: true, always_available: true });
  });

  it.each([
    ["an unknown category", (): string => UNKNOWN],
    [
      "another bar's category",
      (t: ReturnType<typeof setup>): string => t.cat("Pantry", t.bob.barId),
    ],
  ])("refuses %s and creates nothing", async (_, category) => {
    const t = setup();
    const before = t.count();
    const res = await t.send("POST", "", { name: "Honey", category_id: category(t) });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({
      code: "VALIDATION",
      message: "Category not found",
      details: [{ path: ["category_id"], message: "Category not found" }],
    });
    expect(t.count()).toBe(before);
  });

  it("refuses an invalid body", async () => {
    const t = setup();
    expect((await t.send("POST", "", { name: "Honey" })).status).toBe(400);
  });

  it("refuses a viewer", async () => {
    const t = setup();
    t.db
      .insert(barMembers)
      .values({ bar_id: t.bob.barId, user_id: t.alice.userId, role: "viewer" })
      .run();
    const bobs = `${t.bar(t.bob.barId)}/pantry-ingredients`;
    const body = { name: "Honey", category_id: t.cat("Pantry", t.bob.barId) };
    expect((await t.app.request(bobs, jsonRequest("POST", body))).status).toBe(403);
    expect((await t.app.request(bobs)).status).toBe(200);
  });
});

describe("duplicate names", () => {
  it("refuses the same name twice in a category, ignoring case", async () => {
    const t = setup();
    const before = t.count();
    const res = await t.send("POST", "", { name: "LEMON", category_id: t.cat("Garnish") });
    expect(res.status).toBe(409);
    const message = 'An ingredient named "LEMON" already exists in this category';
    expect(await errorOf(res)).toEqual({
      code: "CONFLICT",
      message,
      details: [{ path: ["name"], message }],
    });
    expect(t.count()).toBe(before);
  });

  it("allows the same name in another category or another bar", async () => {
    const t = setup();
    const res = await t.send("POST", "", { name: "Lemon", category_id: t.cat("Pantry") });
    expect(res.status).toBe(201);
    expect(t.ing("Lemon", t.bob.barId)).toBeTruthy();
  });

  it("refuses a rename or a move onto an existing name", async () => {
    const t = setup();
    expect((await t.send("PATCH", `/${t.ing("Lime")}`, { name: "lemon" })).status).toBe(409);
    const created = await t.send("POST", "", { name: "Mint", category_id: t.cat("Pantry") });
    const { id } = await json<PantryIngredient>(created);
    const moved = await t.send("PATCH", `/${id}`, { category_id: t.cat("Garnish") });
    expect(moved.status).toBe(409);
    expect((await errorOf(moved)).message).toBe(
      'An ingredient named "Mint" already exists in this category',
    );
  });
});

describe("PATCH /pantry-ingredients/:id", () => {
  it("restocks and clears a staple, changing only the fields sent", async () => {
    const t = setup();
    const lemon = t.ing("Lemon");
    expect(await json(await t.send("PATCH", `/${lemon}`, { in_stock: true }))).toMatchObject({
      name: "Lemon",
      in_stock: true,
      always_available: false,
    });
    const ice = t.ing("Ice");
    const cleared = await t.send("PATCH", `/${ice}`, { always_available: false });
    expect(await json(cleared)).toMatchObject({ in_stock: false, always_available: false });
  });

  it("renames and moves an ingredient", async () => {
    const t = setup();
    const res = await t.send("PATCH", `/${t.ing("Salt")}`, {
      name: "Flaky salt",
      category_id: t.cat("Garnish"),
    });
    expect(await json(res)).toMatchObject({ name: "Flaky salt", category_name: "Garnish" });
  });

  it("accepts the unchanged category alongside other fields, as forms send it", async () => {
    const t = setup();
    const res = await t.send("PATCH", `/${t.ing("Salt")}`, {
      name: "Sea salt",
      category_id: t.cat("Pantry"),
    });
    expect(res.status).toBe(200);
  });

  it("refuses another bar's category and leaves the ingredient unchanged", async () => {
    const t = setup();
    const salt = t.ing("Salt");
    const res = await t.send("PATCH", `/${salt}`, {
      name: "Moved",
      category_id: t.cat("Pantry", t.bob.barId),
    });
    expect(res.status).toBe(400);
    expect(await json(await t.send("GET", `/${salt}`))).toMatchObject({ name: "Salt" });
  });

  it("answers 404 for an unknown ingredient", async () => {
    const t = setup();
    expect((await t.send("PATCH", `/${UNKNOWN}`, { in_stock: true })).status).toBe(404);
  });
});

describe("DELETE /pantry-ingredients/:id", () => {
  it("deletes an ingredient", async () => {
    const t = setup();
    const before = t.count();
    expect((await t.send("DELETE", `/${t.ing("Salt")}`)).status).toBe(204);
    expect(t.count()).toBe(before - 1);
  });

  it("answers 404 for an unknown ingredient", async () => {
    const t = setup();
    expect((await t.send("DELETE", `/${UNKNOWN}`)).status).toBe(404);
  });
});

describe("deleting a category used by pantry ingredients", () => {
  it("is refused, listing the ingredients, and deletes nothing", async () => {
    const t = setup();
    const before = t.count();
    const res = await t.app.request(`${t.bar(t.alice.barId)}/categories/${t.cat("Garnish")}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({
      code: "CONFLICT",
      message: '"Garnish" still has pantry ingredients',
      details: {
        used_by: ["Lemon", "Lime", "Mint", "Orange"].map((name) => ({
          type: "pantry_ingredient",
          id: t.ing(name),
          name,
        })),
      },
    });
    expect(t.count()).toBe(before);
    expect(t.cat("Garnish")).toBeTruthy();
  });

  it("lists every kind of use in the message, including a legacy garnish bottle", async () => {
    const t = setup();
    const categoriesUrl = `${t.bar(t.alice.barId)}/categories`;
    await t.app.request(
      categoriesUrl,
      jsonRequest("POST", { name: "Citrus", parent_id: t.cat("Garnish") }),
    );
    t.db
      .insert(products)
      .values({
        bar_id: t.alice.barId,
        created_by: t.alice.userId,
        name: "Angostura orange",
        category_id: t.cat("Garnish"),
      })
      .run();
    const res = await t.app.request(`${categoriesUrl}/${t.cat("Garnish")}`, { method: "DELETE" });
    expect((await errorOf(res)).message).toBe(
      '"Garnish" still has sub-categories, bottles and pantry ingredients',
    );
  });
});

describe("cross-bar isolation", () => {
  it("cannot read or change another bar's ingredients", async () => {
    const t = setup();
    const bobsLemon = t.ing("Lemon", t.bob.barId);
    expect((await t.send("GET", `/${bobsLemon}`)).status).toBe(404);
    expect((await t.send("PATCH", `/${bobsLemon}`, { in_stock: true })).status).toBe(404);
    expect((await t.send("DELETE", `/${bobsLemon}`)).status).toBe(404);
    const bobs = `${t.bar(t.bob.barId)}/pantry-ingredients`;
    expect((await t.app.request(bobs)).status).toBe(403);
    expect((await t.app.request(`${bobs}/${bobsLemon}`, { method: "DELETE" })).status).toBe(403);
    const page = await json<Page<PantryIngredient>>(await t.send("GET", "?q=lemon"));
    expect(page.items.map((i) => i.id)).toEqual([t.ing("Lemon")]);
    const row = t.db
      .select()
      .from(pantryIngredients)
      .where(eq(pantryIngredients.id, bobsLemon))
      .get();
    expect(row).toMatchObject({ name: "Lemon", in_stock: false });
  });
});
