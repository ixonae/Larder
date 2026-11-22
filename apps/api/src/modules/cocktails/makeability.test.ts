import {
  type Category,
  type Cocktail,
  type CocktailDetail,
  cocktailDetailSchema,
  cocktailPageSchema,
  type Page,
  type PantryIngredient,
  type Product,
} from "@larder/shared";
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import type { Db } from "../../db/client.ts";
import { categories, pantryIngredients, products } from "../../db/schema/index.ts";
import { createTestApp, errorOf, jsonRequest, readJson, type TestApp } from "../../test/app.ts";

async function setup(): Promise<{
  app: TestApp["app"];
  db: Db;
  bar: string;
  bob: { userId: string; barId: string };
  send: <T>(method: string, path: string, input: object, status?: number) => Promise<T>;
  addBottle: (name: string, category_id: string, owned?: boolean) => Promise<Product>;
  addSupply: (name: string, category_id: string, flags?: object) => Promise<PantryIngredient>;
  setStock: (id: string, in_stock: boolean) => Promise<unknown>;
  setOwned: (id: string, owned: boolean) => Promise<unknown>;
  create: (name: string, ingredients: object[]) => Promise<CocktailDetail>;
  get: (id: string) => Promise<CocktailDetail>;
  list: (query?: string) => Promise<Page<Cocktail>>;
  names: (query: string) => Promise<string[]>;
  gin: Category;
  london: Category;
  rum: Category;
  bottledLemon: Category;
  fruit: Category;
  larder: Category;
}> {
  const { app, db, alice, bob } = createTestApp();
  const bar = `/api/bars/${alice.barId}`;
  const send = async <T>(
    method: string,
    path: string,
    input: object,
    status: number = 200,
  ): Promise<T> => {
    const response = await app.request(`${bar}/${path}`, jsonRequest(method, input));
    expect(response.status).toBe(status);
    return readJson<T>(response);
  };
  const post = <T>(path: string, input: object): Promise<T> => send<T>("POST", path, input, 201);
  const addCategory = (input: object): Promise<Category> => post<Category>("categories", input);
  const addSupply = (
    name: string,
    category_id: string,
    flags: object = {},
  ): Promise<PantryIngredient> =>
    post<PantryIngredient>("pantry-ingredients", { name, category_id, ...flags });
  const addBottle = (name: string, category_id: string, owned: boolean = true): Promise<Product> =>
    post<Product>("products", { name, category_id, status: owned ? "owned" : "tasted" });
  const setStock = (id: string, in_stock: boolean): Promise<unknown> =>
    send("PATCH", `pantry-ingredients/${id}`, { in_stock });
  const setOwned = (id: string, owned: boolean): Promise<unknown> =>
    send("PATCH", `products/${id}/status`, { status: owned ? "owned" : "finished" });
  const create = async (name: string, ingredients: object[]): Promise<CocktailDetail> =>
    cocktailDetailSchema.parse(await post("cocktails", { name, method: "shaken", ingredients }));
  const get = async (id: string): Promise<CocktailDetail> =>
    cocktailDetailSchema.parse(await (await app.request(`${bar}/cocktails/${id}`)).json());
  const list = async (query: string = ""): Promise<Page<Cocktail>> =>
    cocktailPageSchema.parse(await (await app.request(`${bar}/cocktails?${query}`)).json());
  const names = async (query: string): Promise<string[]> =>
    (await list(query)).items.map(({ name }) => name);

  const spirit = await addCategory({ name: "Distilled", kind: "spirit" });
  const gin = await addCategory({ name: "Juniper", parent_id: spirit.id });
  const london = await addCategory({ name: "Dry juniper", parent_id: gin.id });
  const rum = await addCategory({ name: "Cane", parent_id: spirit.id });
  const juice = await addCategory({ name: "Pressed", kind: "juice" });
  const bottledLemon = await addCategory({ name: "Bottled citrus", parent_id: juice.id });
  const fruit = await addCategory({ name: "Fruit", kind: "garnish" });
  const larder = await addCategory({ name: "Larder", kind: "other" });
  return {
    app,
    db,
    bar,
    bob,
    send,
    addBottle,
    addSupply,
    setStock,
    setOwned,
    create,
    get,
    list,
    names,
    gin,
    london,
    rum,
    bottledLemon,
    fruit,
    larder,
  };
}

const line = (source: object, extra: object = {}): { amount: number; unit: string } => ({
  amount: 1,
  unit: "piece",
  ...source,
  ...extra,
});

test("a juice line accepting fresh or bottled is missing only when neither is there; fresh-only lines and the twist need the lemon", async () => {
  const { addBottle, addSupply, setStock, setOwned, create, get, bottledLemon, fruit } =
    await setup();
  const lemon = await addSupply("Lemon", fruit.id);
  const bottle = await addBottle("Squeezy", bottledLemon.id, false);
  const flexible = await create("Flexible Sour", [
    line(
      { pantry_ingredient_id: lemon.id },
      { amount: 25, unit: "ml", alternatives: [{ category_id: bottledLemon.id }] },
    ),
  ]);
  const strict = await create("Strict Sour", [
    line({ pantry_ingredient_id: lemon.id }, { amount: 25, unit: "ml", note: "freshly squeezed" }),
    line({ pantry_ingredient_id: lemon.id }, { note: "twist" }),
  ]);
  const missingIn = async (id: string): Promise<string[]> =>
    (await get(id)).missing.map(({ name }) => name);

  // Neither.
  expect((await get(flexible.id)).missing).toEqual([
    { id: flexible.ingredients[0]?.id, name: "Lemon", alternatives: ["Bottled citrus"] },
  ]);
  expect(await missingIn(strict.id)).toEqual(["Lemon", "Lemon"]);
  // Bottle only.
  await setOwned(bottle.id, true);
  expect(await missingIn(flexible.id)).toEqual([]);
  expect(await missingIn(strict.id)).toEqual(["Lemon", "Lemon"]);
  // Both.
  await setStock(lemon.id, true);
  expect(await missingIn(flexible.id)).toEqual([]);
  expect(await missingIn(strict.id)).toEqual([]);
  // Fresh only.
  await setOwned(bottle.id, false);
  expect(await missingIn(flexible.id)).toEqual([]);
  expect(await missingIn(strict.id)).toEqual([]);
});

test("staples, optional garnishes and required blending ice", async () => {
  const { addSupply, setStock, create, get, fruit, larder } = await setup();
  const water = await addSupply("Still water", larder.id, { always_available: true });
  const mint = await addSupply("Mint", fruit.id);
  const ice = await addSupply("Ice", larder.id);
  const frozen = await create("Frozen", [
    line({ pantry_ingredient_id: water.id }, { amount: 10, unit: "ml" }),
    line({ pantry_ingredient_id: mint.id }, { optional: true }),
    line({ pantry_ingredient_id: ice.id }, { amount: 100, unit: "ml", note: "for blending" }),
  ]);
  expect(frozen.missing.map(({ name }) => name)).toEqual(["Ice"]);
  await setStock(ice.id, true);
  expect((await get(frozen.id)).missing).toEqual([]);
});

test("products must be owned, and categories match owned bottles in sub-categories", async () => {
  const { addBottle, setOwned, create, get, gin, london, rum } = await setup();
  const dry = await addBottle("Dry Bottle", london.id);
  const cane = await addBottle("Cane Bottle", rum.id, false);
  const martini = await create("Juniper Martini", [line({ category_id: gin.id })]);
  const named = await create("Named Cane", [line({ product_id: cane.id })]);
  expect(martini.missing).toEqual([]);
  expect(named.missing.map(({ name }) => name)).toEqual(["Cane Bottle"]);
  await setOwned(cane.id, true);
  await setOwned(dry.id, false);
  expect((await get(martini.id)).missing.map(({ name }) => name)).toEqual(["Juniper"]);
  expect((await get(named.id)).missing).toEqual([]);
});

test("an always-available category can satisfy recipes without a matching bottle", async () => {
  const { addBottle, create, get, names, send, gin, london, rum } = await setup();
  const bottle = await addBottle("Dry Bottle", gin.id, false);
  const generic = await create("Juniper Martini", [line({ category_id: gin.id })]);
  const substitute = await create("Cane or Juniper", [
    line({ category_id: rum.id }, { alternatives: [{ category_id: gin.id }] }),
  ]);
  const narrower = await create("Dry Juniper Martini", [line({ category_id: london.id })]);
  const named = await create("Named Martini", [line({ product_id: bottle.id })]);
  expect(await names("missing=0")).toEqual([]);

  // A generic category covers itself. A more specific recipe needs its own source.
  const setAvailable = (id: string, always_available: boolean): Promise<Category> =>
    send("PATCH", `categories/${id}`, { always_available });
  await setAvailable(gin.id, true);
  expect(await names("missing=0")).toEqual([substitute.name, generic.name]);
  expect((await get(generic.id)).ingredients[0]?.matching_bottles).toEqual([]);
  const withSubstitute = await get(substitute.id);
  expect(withSubstitute.missing).toEqual([]);
  expect(withSubstitute.ingredients[0]?.alternatives[0]?.matching_bottles).toEqual([]);

  // Availability from a sub-category also satisfies recipes that allow its parent.
  await setAvailable(gin.id, false);
  await setAvailable(london.id, true);
  expect(await names("missing=0")).toEqual([substitute.name, narrower.name, generic.name]);
  expect((await get(named.id)).missing.map(({ name }) => name)).toEqual([bottle.name]);

  await setAvailable(london.id, false);
  expect(await names("missing=0")).toEqual([]);
});

test("list reports missing lines and filters by the exact missing count across pages", async () => {
  const { addSupply, setStock, create, list, names, fruit, larder } = await setup();
  const lemon = await addSupply("Lemon", fruit.id);
  const egg = await addSupply("Egg", larder.id);
  const salt = await addSupply("Salt", larder.id, { in_stock: true });
  await create("A None Missing", [line({ pantry_ingredient_id: salt.id })]);
  await create("B One Missing", [line({ pantry_ingredient_id: lemon.id })]);
  await create("C Two Missing", [
    line({ pantry_ingredient_id: lemon.id }),
    line({ pantry_ingredient_id: egg.id }),
  ]);
  await create("D Empty", []);

  const all = await list();
  expect(all.items.map(({ missing }) => missing.length)).toEqual([0, 1, 2, 0]);
  expect(all.items[2]?.missing.map(({ name }) => name)).toEqual(["Lemon", "Egg"]);
  expect(await names("missing=0")).toEqual(["A None Missing", "D Empty"]);
  expect(await names("missing=1")).toEqual(["B One Missing"]);
  expect(await names("missing=2")).toEqual(["C Two Missing"]);
  expect(await names("missing=3")).toEqual([]);
  expect(await names("missing=0&q=missing")).toEqual(["A None Missing"]);

  // Filtered pages skip non-matching cocktails and still chain with the cursor.
  const first = await list("missing=0&limit=1");
  expect(first.items.map(({ name }) => name)).toEqual(["A None Missing"]);
  const second = await list(`missing=0&limit=1&cursor=${first.next_cursor}`);
  expect(second).toMatchObject({ items: [{ name: "D Empty" }], next_cursor: null });

  // Restocking the Pantry changes the list on the next read.
  await setStock(lemon.id, true);
  expect(await names("missing=0")).toEqual(["A None Missing", "B One Missing", "D Empty"]);
});

test("detail lists matching owned bottles for each category source, preferred or alternative", async () => {
  const { addBottle, addSupply, create, gin, london, rum, bottledLemon, fruit } = await setup();
  const dry = await addBottle("Dry Bottle", london.id);
  const plain = await addBottle("Plain Juniper", gin.id);
  await addBottle("Stored Juniper", gin.id, false);
  const cane = await addBottle("Cane Bottle", rum.id);
  const lemon = await addSupply("Lemon", fruit.id);
  const recipe = await create("Choices", [
    line(
      { category_id: gin.id },
      { alternatives: [{ category_id: rum.id }, { product_id: cane.id }] },
    ),
    line({ pantry_ingredient_id: lemon.id }, { alternatives: [{ category_id: bottledLemon.id }] }),
  ]);
  const [spirits, citrus] = recipe.ingredients;
  expect(spirits?.matching_bottles).toEqual([
    { id: dry.id, name: "Dry Bottle" },
    { id: plain.id, name: "Plain Juniper" },
  ]);
  expect(spirits?.alternatives.map(({ matching_bottles }) => matching_bottles)).toEqual([
    [{ id: cane.id, name: "Cane Bottle" }],
    [],
  ]);
  expect(citrus?.matching_bottles).toEqual([]);
  expect(citrus?.alternatives[0]?.matching_bottles).toEqual([]);
});

test("another bar's stock never makes a cocktail available or shows as a matching bottle", async () => {
  const { db, bob, addSupply, create, get, list, gin, fruit } = await setup();
  const lemon = await addSupply("Lemon", fruit.id);
  const sour = await create("Alice Sour", [
    line({ pantry_ingredient_id: lemon.id }),
    line({ category_id: gin.id }),
  ]);
  // Bob stocks everything he has, with a bottle in his own juniper category.
  const audit = { bar_id: bob.barId, created_by: bob.userId };
  db.update(pantryIngredients)
    .set({ in_stock: true })
    .where(eq(pantryIngredients.bar_id, bob.barId))
    .run();
  const foreign = db
    .insert(categories)
    .values({ ...audit, name: gin.name, kind: "spirit", always_available: true })
    .returning()
    .get();
  db.insert(products)
    .values({ ...audit, name: "Bob's Bottle", category_id: foreign.id, status: "owned" })
    .run();

  const detail = await get(sour.id);
  expect(detail.missing.map(({ name }) => name)).toEqual(["Lemon", "Juniper"]);
  expect(detail.ingredients[1]?.matching_bottles).toEqual([]);
  expect((await list("missing=0")).items).toEqual([]);
});

test.each(["missing=", "missing=%20", "missing=-1", "missing=1.5", "missing=0x1", "missing=x"])(
  "rejects %s",
  async (query) => {
    const { app, bar } = await setup();
    const response = await app.request(`${bar}/cocktails?${query}`);
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("VALIDATION");
  },
);
