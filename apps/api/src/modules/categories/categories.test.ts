import type { Category, CategoryTree, Page } from "@larder/shared";
import { and, count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { barMembers, categories, pantryIngredients } from "../../db/schema/index.ts";
import { createTestApp, errorOf, readJson as json, jsonRequest } from "../../test/app.ts";
import { STARTER_PANTRY } from "../pantry/starter.ts";
import { STARTER_CATEGORIES } from "./starter.ts";

const UNKNOWN = "01a1f326-d941-7d74-8a40-504a488cd388";

function setup() {
  const t = createTestApp();
  const base = `/api/bars/${t.alice.barId}/categories`;
  const idOf = (name: string, barId = t.alice.barId) => {
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
  const countRows = () =>
    t.db.select({ n: count() }).from(categories).where(eq(categories.bar_id, t.alice.barId)).get()
      ?.n ?? 0;
  return { ...t, base, idOf, send, count: countRows };
}

describe("starter categories", () => {
  it("are created with every new bar", async () => {
    const { send } = setup();
    const { items } = await json<CategoryTree>(await send("GET", "/tree"));
    expect(items.map((c) => c.name)).toEqual([
      "Beer",
      "Bitters",
      "Garnish",
      "Juice",
      "Liqueur",
      "Mixer",
      "Pantry",
      "Spirit",
      "Syrup",
      "Wine",
    ]);
    const spirit = items.find((c) => c.name === "Spirit");
    const whisky = spirit?.children.find((c) => c.name === "Whisky");
    expect(whisky?.children.map((c) => c.name)).toContain("Scotch");
    expect(whisky).toMatchObject({ kind: "spirit", default_abv: 40 });
    const juice = items.find((c) => c.name === "Juice");
    expect(juice?.children[0]).toMatchObject({ name: "Lemon juice", kind: "juice" });
    // Whole fruit and pantry staples are pantry ingredients, not categories.
    expect(items.find((c) => c.name === "Garnish")?.children).toEqual([]);
    expect(items.find((c) => c.name === "Pantry")?.children).toEqual([]);
  });
});

describe("starter pantry ingredients", () => {
  it("are filed under starter categories that exist", () => {
    const names = new Set<string>();
    const visit = (nodes: typeof STARTER_CATEGORIES) => {
      for (const node of nodes) {
        names.add(node.name);
        visit(node.children ?? []);
      }
    };
    visit(STARTER_CATEGORIES);
    expect(Object.keys(STARTER_PANTRY).filter((name) => !names.has(name))).toEqual([]);
    // Names are unique across the tree, so the name → id map handed to the pantry seed loses nothing.
    expect(names.size).toBe(JSON.stringify(STARTER_CATEGORIES).match(/"name"/g)?.length);
  });

  it("are created with every new bar, grouped under Garnish and Pantry", () => {
    const { db, alice, idOf } = setup();
    const rows = db
      .select({
        name: pantryIngredients.name,
        category_id: pantryIngredients.category_id,
        in_stock: pantryIngredients.in_stock,
        always_available: pantryIngredients.always_available,
      })
      .from(pantryIngredients)
      .where(eq(pantryIngredients.bar_id, alice.barId))
      .all();
    const garnish = idOf("Garnish");
    const pantry = idOf("Pantry");
    const staple = (name: string, category_id: string, always_available = false) => ({
      name,
      category_id,
      in_stock: false,
      always_available,
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        staple("Lemon", garnish),
        staple("Lime", garnish),
        staple("Mint", garnish),
        staple("Orange", garnish),
        staple("Ice", pantry, true),
        staple("Water", pantry, true),
        staple("Sugar", pantry, true),
        staple("Egg", pantry),
        staple("Egg white", pantry),
        staple("Salt", pantry),
      ]),
    );
    expect(rows).toHaveLength(10);
    // One Lemon ingredient, and no Lemon category leaf; the Lemon juice bottle category stays.
    expect(rows.filter((r) => r.name === "Lemon")).toHaveLength(1);
    expect(() => idOf("Lemon")).toThrow("No category Lemon");
    expect(idOf("Lemon juice")).toBeTruthy();
  });
});

describe("GET /categories", () => {
  it("lists a flat page sorted by name, with parent_id", async () => {
    const { send, idOf } = setup();
    const page = await json<Page<Category>>(await send("GET", "?limit=3"));
    expect(page.items.map((c) => c.name)).toEqual(["Aged rum", "Amaro", "Aromatic bitters"]);
    expect(page.items[0]?.parent_id).toBe(idOf("Rum"));
    expect(page.next_cursor).toEqual(expect.any(String));
  });

  it("walks every page with the cursor", async () => {
    const { send, count } = setup();
    const names: string[] = [];
    let cursor: string | null = "";
    while (cursor !== null) {
      const res = await send("GET", `?limit=7${cursor ? `&cursor=${cursor}` : ""}`);
      const page: Page<Category> = await json(res);
      names.push(...page.items.map((c) => c.name));
      cursor = page.next_cursor;
    }
    expect(names).toHaveLength(count());
    expect(names).toEqual([...names].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1)));
  });

  it("filters by name, kind and parent", async () => {
    const { send, idOf } = setup();
    const names = async (query: string) =>
      (await json<Page<Category>>(await send("GET", query))).items.map((c) => c.name);
    expect(await names("?q=JUICE")).toEqual(["Juice", "Lemon juice", "Lime juice", "Orange juice"]);
    expect(await names("?kind=bitters")).toEqual(["Aromatic bitters", "Bitters", "Orange bitters"]);
    expect(await names(`?parent_id=${idOf("Rum")}`)).toEqual(["Aged rum", "White rum"]);
    expect(await names("?q=zzz")).toEqual([]);
  });

  it.each(["?cursor=nope", "?kind=soda"])("refuses %s", async (query) => {
    const { send } = setup();
    const res = await send("GET", query);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("VALIDATION");
  });
});

describe("GET /categories/:id", () => {
  it("returns one category", async () => {
    const { send, idOf } = setup();
    const res = await send("GET", `/${idOf("Gin")}`);
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      name: "Gin",
      kind: "spirit",
      parent_id: idOf("Spirit"),
    });
  });

  it.each([UNKNOWN, "nope"])("answers 404 for %s", async (id) => {
    const { send } = setup();
    const res = await send("GET", `/${id}`);
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toEqual({ code: "NOT_FOUND", message: "Category not found" });
  });
});

describe("POST /categories", () => {
  it("creates a root category", async () => {
    const { send, alice, db } = setup();
    const res = await send("POST", "", { name: " Sake ", kind: "wine", default_abv: 15 });
    expect(res.status).toBe(201);
    const created = await json<Category>(res);
    expect(created).toMatchObject({
      name: "Sake",
      parent_id: null,
      kind: "wine",
      default_abv: 15,
      description: null,
    });
    const row = db.select().from(categories).where(eq(categories.id, created.id)).get();
    expect(row).toMatchObject({ bar_id: alice.barId, created_by: alice.userId });
  });

  it("inherits the parent's kind", async () => {
    const { send, idOf } = setup();
    const res = await send("POST", "", { name: "Yuzu juice", parent_id: idOf("Juice") });
    expect(await json(res)).toMatchObject({ kind: "juice" });
  });

  it.each([
    ["a root without kind", { name: "Misc" }, "kind is required for a root category"],
    ["an unknown parent", { name: "X", parent_id: UNKNOWN }, "Parent category not found"],
  ])("refuses %s", async (_, body, message) => {
    const { send, count } = setup();
    const before = count();
    const res = await send("POST", "", body);
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatchObject({ code: "VALIDATION", message });
    expect(count()).toBe(before);
  });

  it("reports an unknown parent on the parent field", async () => {
    const { send } = setup();
    const res = await send("POST", "", { name: "X", parent_id: UNKNOWN });
    expect((await errorOf(res)).details).toEqual([
      { path: ["parent_id"], message: "Parent category not found" },
    ]);
  });

  it("refuses an invalid body", async () => {
    const { send } = setup();
    expect((await send("POST", "", { name: "" })).status).toBe(400);
  });

  it("refuses a viewer", async () => {
    const { app, db, alice, bob } = setup();
    db.insert(barMembers)
      .values({ bar_id: bob.barId, user_id: alice.userId, role: "viewer" })
      .run();
    const res = await app.request(
      `/api/bars/${bob.barId}/categories`,
      jsonRequest("POST", { name: "X", kind: "other" }),
    );
    expect(res.status).toBe(403);
    expect((await app.request(`/api/bars/${bob.barId}/categories`)).status).toBe(200);
  });
});

describe("duplicate names", () => {
  it("refuses two root categories with the same name, ignoring case", async () => {
    const { send, count } = setup();
    const before = count();
    const res = await send("POST", "", { name: "SPIRIT", kind: "spirit" });
    expect(res.status).toBe(409);
    const message = 'A category named "SPIRIT" already exists at this level';
    expect(await errorOf(res)).toEqual({
      code: "CONFLICT",
      message,
      details: [{ path: ["name"], message }],
    });
    expect(count()).toBe(before);
  });

  it("refuses two siblings with the same name, including accents in another form", async () => {
    const { send, idOf } = setup();
    const parent_id = idOf("Liqueur");
    expect((await send("POST", "", { name: "Crème de cassis", parent_id })).status).toBe(201);
    const nfd = "CRÈME DE CASSIS".normalize("NFD");
    expect((await send("POST", "", { name: nfd, parent_id })).status).toBe(409);
    expect((await send("POST", "", { name: "Creme de cassis", parent_id })).status).toBe(201);
  });

  it("allows the same name under another parent or in another bar", async () => {
    const { send, idOf, bob } = setup();
    expect((await send("POST", "", { name: "Gin", parent_id: idOf("Liqueur") })).status).toBe(201);
    expect(idOf("Gin", bob.barId)).toBeTruthy();
  });

  it("refuses a rename or a move onto an existing name", async () => {
    const { send, idOf } = setup();
    expect((await send("PATCH", `/${idOf("Gin")}`, { name: "vodka" })).status).toBe(409);
    const gin = idOf("Gin");
    expect((await send("POST", "", { name: "Gin", kind: "spirit" })).status).toBe(201);
    const moved = await send("PATCH", `/${gin}`, { parent_id: null });
    expect(moved.status).toBe(409);
  });
});

describe("PATCH /categories/:id", () => {
  it("changes only the fields sent", async () => {
    const { send, idOf } = setup();
    const res = await send("PATCH", `/${idOf("Gin")}`, { name: "London gin", description: "Dry" });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      name: "London gin",
      description: "Dry",
      default_abv: 40,
      parent_id: idOf("Spirit"),
    });
    const cleared = await send("PATCH", `/${idOf("London gin")}`, { description: "" });
    expect(await json(cleared)).toMatchObject({ description: null });
  });

  it("moves a category to another parent or to the root", async () => {
    const { send, idOf } = setup();
    const id = idOf("Vermouth");
    expect(await json(await send("PATCH", `/${id}`, { parent_id: idOf("Liqueur") }))).toMatchObject(
      {
        parent_id: idOf("Liqueur"),
      },
    );
    expect(await json(await send("PATCH", `/${id}`, { parent_id: null }))).toMatchObject({
      parent_id: null,
    });
  });

  it("accepts the unchanged parent alongside other fields, as forms send it", async () => {
    const { send, idOf } = setup();
    const res = await send("PATCH", `/${idOf("Gin")}`, {
      name: "Old Tom gin",
      parent_id: idOf("Spirit"),
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ name: "Old Tom gin", parent_id: idOf("Spirit") });
  });

  it.each([
    ["itself", "Whisky", "Whisky"],
    ["a child", "Whisky", "Scotch"],
    ["a grandchild", "Spirit", "Scotch"],
  ])("refuses a move under %s", async (_, from, target) => {
    const { send, idOf } = setup();
    const res = await send("PATCH", `/${idOf(from)}`, { parent_id: idOf(target) });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).message).toBe(
      "A category cannot be moved under itself or one of its sub-categories",
    );
  });

  it("refuses a parent from another bar", async () => {
    const { send, idOf, bob } = setup();
    const res = await send("PATCH", `/${idOf("Gin")}`, { parent_id: idOf("Spirit", bob.barId) });
    expect(res.status).toBe(400);
  });

  it("answers 404 for an unknown category", async () => {
    const { send } = setup();
    expect((await send("PATCH", `/${UNKNOWN}`, { name: "X" })).status).toBe(404);
  });
});

describe("DELETE /categories/:id", () => {
  it("deletes a leaf", async () => {
    const { send, idOf, count } = setup();
    const before = count();
    const res = await send("DELETE", `/${idOf("Pisco")}`);
    expect(res.status).toBe(204);
    expect(count()).toBe(before - 1);
    expect((await send("GET", `/${idOf("Gin")}`)).status).toBe(200);
  });

  it("refuses to delete a category still in use and deletes nothing", async () => {
    const { send, idOf, count } = setup();
    const before = count();
    const res = await send("DELETE", `/${idOf("Rum")}`);
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({
      code: "CONFLICT",
      message: '"Rum" still has sub-categories',
      details: {
        used_by: [
          { type: "category", id: idOf("Aged rum"), name: "Aged rum" },
          { type: "category", id: idOf("White rum"), name: "White rum" },
        ],
      },
    });
    expect(count()).toBe(before);
  });

  it("answers 404 for an unknown category", async () => {
    const { send } = setup();
    expect((await send("DELETE", `/${UNKNOWN}`)).status).toBe(404);
  });
});

describe("cross-bar isolation", () => {
  it("cannot read or change another bar's categories", async () => {
    const { app, send, idOf, bob, db } = setup();
    const bobsGin = idOf("Gin", bob.barId);
    // Through Alice's bar, Bob's category does not exist.
    expect((await send("GET", `/${bobsGin}`)).status).toBe(404);
    expect((await send("PATCH", `/${bobsGin}`, { name: "Mine" })).status).toBe(404);
    expect((await send("DELETE", `/${bobsGin}`)).status).toBe(404);
    // Through Bob's bar, Alice is not a member.
    const bobs = `/api/bars/${bob.barId}/categories`;
    expect((await app.request(bobs)).status).toBe(403);
    expect((await app.request(`${bobs}/${bobsGin}`, { method: "DELETE" })).status).toBe(403);
    // Lists only show Alice's own categories.
    const page = await json<Page<Category>>(await send("GET", "?q=gin"));
    expect(page.items.map((c) => c.id)).toEqual([idOf("Gin"), idOf("Ginger beer")]);
    expect(db.select().from(categories).where(eq(categories.id, bobsGin)).get()?.name).toBe("Gin");
  });
});
