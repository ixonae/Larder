import {
  type Category,
  type Cocktail,
  type CocktailDetail,
  cocktailDetailSchema,
  cocktailPageSchema,
  newId,
  type Page,
  type PantryIngredient,
  type Product,
} from "@larder/shared";
import { expect, test } from "vitest";
import type { Db } from "../../db/client.ts";
import { categories, tags } from "../../db/schema/index.ts";
import { createTestApp, jsonRequest, readJson, type TestApp } from "../../test/app.ts";

async function setup(): Promise<{
  app: TestApp["app"];
  db: Db;
  bob: { userId: string; barId: string };
  path: string;
  post: (entity: string, input: object) => Promise<Response>;
  create: (name: string, patch: object) => Promise<CocktailDetail>;
  list: (query?: string) => Promise<Page<Cocktail>>;
  spirit: Category;
  family: Category;
  leaf: Category;
  other: Category;
  mixer: Category;
  bottle: string;
  zero: string;
  garnish: string;
}> {
  const { app, alice, bob, db } = createTestApp();
  const bar = `/api/bars/${alice.barId}`;
  const path = `${bar}/cocktails`;
  async function post(entity: string, input: object): Promise<Response> {
    const response = await app.request(`${bar}/${entity}`, jsonRequest("POST", input));
    expect(response.status).toBe(201);
    return response;
  }
  const addCategory = (input: object): Promise<Category> =>
    post("categories", input).then((response) => readJson<Category>(response));
  const spirit = await addCategory({ name: "Distilled", kind: "spirit", default_abv: 45 });
  const family = await addCategory({ name: "Agave", parent_id: spirit.id });
  const leaf = await addCategory({ name: "Blanco", parent_id: family.id });
  const other = await addCategory({ name: "Neutral spirit", parent_id: spirit.id });
  const mixer = await addCategory({ name: "Sparkling mixer", kind: "mixer" });
  const { id: bottle } = await readJson<Product>(
    await post("products", { name: "Bottle", category_id: leaf.id, abv: 30 }),
  );
  const { id: zero } = await readJson<Product>(
    await post("products", { name: "Zero-proof bottle", category_id: leaf.id, abv: 0 }),
  );
  const citrus = await addCategory({ name: "Citrus", kind: "garnish" });
  const { id: garnish } = await readJson<PantryIngredient>(
    await post("pantry-ingredients", { name: "Peel", category_id: citrus.id }),
  );
  const create = async (name: string, patch: object): Promise<CocktailDetail> =>
    cocktailDetailSchema.parse(
      await (await post("cocktails", { name, method: "shaken", ...patch })).json(),
    );
  const list = async (query: string = ""): Promise<Page<Cocktail>> =>
    cocktailPageSchema.parse(await (await app.request(`${path}?${query}`)).json());
  return {
    app,
    db,
    bob,
    path,
    post,
    create,
    list,
    spirit,
    family,
    leaf,
    other,
    mixer,
    bottle,
    zero,
    garnish,
  };
}

test("list and detail compute the preferred recipe, and scaling leaves saved servings intact", async () => {
  const { app, path, create, list, family, leaf, other, mixer, bottle, zero, garnish } =
    await setup();
  const recipe = await create("Agave Fizz", {
    servings: 2,
    ingredients: [
      { product_id: bottle, amount: 2, unit: "cl", alternatives: [{ category_id: other.id }] },
      { category_id: leaf.id, amount: 20, unit: "ml" },
      { product_id: zero, amount: 20, unit: "ml" },
      { category_id: mixer.id, amount: 40, unit: "ml", optional: true },
      { pantry_ingredient_id: garnish, amount: 3, unit: "wedge" },
      { category_id: mixer.id, unit: "top" },
      { category_id: leaf.id, unit: "to_taste", preparation_only: true },
    ],
  });
  expect(recipe.computed.volume_ml).toBe(60);
  expect(recipe.computed.abv).toBeCloseTo(20);
  expect(recipe.computed.spirits).toEqual([{ id: family.id, name: family.name }]);
  // Preparation-only lines (a rinse) are left out of the ingredient summary.
  expect(recipe.computed.ingredients).toEqual([
    "Bottle",
    "Blanco",
    "Zero-proof bottle",
    "Sparkling mixer",
    "Peel",
    "Sparkling mixer",
  ]);
  const page = await list();
  expect(page.items[0]?.computed).toEqual(recipe.computed);
  const url = `${path}/${recipe.id}`;
  const scaled = cocktailDetailSchema.parse(await (await app.request(`${url}?servings=1`)).json());
  expect(scaled.servings).toBe(1);
  expect(scaled.ingredients.map(({ amount }) => amount)).toEqual([1, 10, 10, 20, 2, null, null]);
  expect(scaled.ingredients[0]?.alternatives).toEqual(recipe.ingredients[0]?.alternatives);
  expect(scaled.computed).toEqual({ ...recipe.computed, volume_ml: 30 });
  expect(await (await app.request(url)).json()).toEqual(recipe);
  for (const invalid of ["0", "-1", "1.5", "NaN", "", "9007199254740992"]) {
    expect((await app.request(`${url}?servings=${invalid}`)).status).toBe(400);
  }
});

test("returns a valid recipe when volume overflows and rejects an unrepresentable scaled quantity", async () => {
  const { app, path, create, list, leaf } = await setup();
  const recipe = await create("Large pour", {
    ingredients: [{ category_id: leaf.id, amount: 1e308, unit: "oz" }],
  });
  expect(recipe.computed.volume_ml).toBeNull();
  expect(recipe.computed.abv).toBeCloseTo(36);
  const url = `${path}/${recipe.id}`;
  expect(await (await app.request(url)).json()).toEqual(recipe);
  expect((await list()).items[0]?.computed).toEqual(recipe.computed);
  expect((await app.request(`${url}?servings=2`)).status).toBe(400);

  const tiny = await create("Tiny pour", {
    servings: 2,
    ingredients: [{ category_id: leaf.id, amount: Number.MIN_VALUE, unit: "ml" }],
  });
  expect((await app.request(`${path}/${tiny.id}?servings=1`)).status).toBe(400);
});

test("scales small positive measures and retains at least one required count", async () => {
  const { app, path, create, leaf } = await setup();
  const recipe = await create("Big batch", {
    servings: Number.MAX_SAFE_INTEGER,
    ingredients: [
      { category_id: leaf.id, amount: 30, unit: "ml" },
      { category_id: leaf.id, amount: 1, unit: "wedge" },
    ],
  });
  const response = await app.request(`${path}/${recipe.id}?servings=1`);
  const scaled = cocktailDetailSchema.parse(await response.json());
  expect(scaled.ingredients.map(({ amount }) => amount)).toEqual([
    30 * (1 / Number.MAX_SAFE_INTEGER),
    1,
  ]);
  expect(scaled.computed.volume_ml).toBeGreaterThan(0);
});

test("reports and filters by the direct spirit family in a mixed-kind category path", async () => {
  const { post, create, list, spirit } = await setup();
  const family = await readJson<Category>(
    await post("categories", { name: "Mixed Agave", kind: "other", parent_id: spirit.id }),
  );
  const leaf = await readJson<Category>(
    await post("categories", { name: "Mezcal", kind: "spirit", parent_id: family.id }),
  );
  const recipe = await create("Agave Neat", {
    ingredients: [{ category_id: leaf.id, amount: 30, unit: "ml" }],
  });
  expect(recipe.computed.spirits).toEqual([{ id: family.id, name: family.name }]);
  expect((await list(`alcohol=${family.id}`)).items.map(({ id }) => id)).toEqual([recipe.id]);
});

test("combines descendant spirit and tag filters before paging and isolates other bars", async () => {
  const { app, db, bob, path, create, list, spirit, family, leaf, other, mixer, bottle } =
    await setup();
  const metadata = { tags: ["Citrusy"] };
  const mixed = { category_id: mixer.id, unit: "top", alternatives: [{ category_id: leaf.id }] };
  await create("A Fizz", { ...metadata, ingredients: [mixed] });
  const first = await create("B Fizz", {
    ...metadata,
    ingredients: [{ product_id: bottle, amount: 10, unit: "ml" }],
  });
  const second = await create("C Fizz", {
    ...metadata,
    ingredients: [{ category_id: leaf.id, amount: 10, unit: "ml" }],
  });
  const direct = await create("D Fizz", {
    ...metadata,
    method: "stirred",
    ingredients: [{ category_id: family.id, amount: 10, unit: "ml" }],
  });
  const alternativeFamily = await create("E Fizz", {
    tags: ["Another tag"],
    ingredients: [{ category_id: other.id, unit: "top" }],
  });
  const tag = first.tags[0]?.id;
  const query = `alcohol=${family.id}&tag=${tag}&method=shaken&q=FIZZ&limit=1`;
  const page = await list(query);
  expect(page.items.map(({ id }) => id)).toEqual([first.id]);
  expect(page.next_cursor).toBeTypeOf("string");
  const next = await list(`${query}&cursor=${page.next_cursor}`);
  expect(next.items.map(({ id }) => id)).toEqual([second.id]);
  expect(next.next_cursor).toBeNull();
  expect((await list(`alcohol=${spirit.id}`)).items.map(({ id }) => id)).toEqual([
    first.id,
    second.id,
    direct.id,
    alternativeFamily.id,
  ]);
  expect((await list(`alcohol=${mixer.id}`)).items).toEqual([]);

  const audit = { bar_id: bob.barId, created_by: bob.userId };
  const foreignSpirit = db
    .insert(categories)
    .values({ ...audit, name: spirit.name, kind: "spirit" })
    .returning()
    .get();
  const foreignTag = db
    .insert(tags)
    .values({ ...audit, name: "Citrusy" })
    .returning()
    .get();
  for (const query of [`alcohol=${foreignSpirit.id}`, `tag=${foreignTag.id}`, `tag=${newId()}`]) {
    expect(await list(query)).toEqual({ items: [], next_cursor: null });
  }
  for (const query of ["alcohol=Agave", "tag=Citrusy"]) {
    expect((await app.request(`${path}?${query}`)).status).toBe(400);
  }
});

test("filters by several alcohols, mixers, tags and methods", async () => {
  const { app, path, post, create, list, family, other, mixer } = await setup();
  const juice = await readJson<Category>(
    await post("categories", { name: "Citrus juice", kind: "juice" }),
  );
  const line = (category_id: string): { category_id: string; amount: number; unit: string } => ({
    category_id,
    amount: 10,
    unit: "ml",
  });
  const both = await create("Both", {
    tags: ["Classic", "Sour"],
    ingredients: [line(family.id), line(other.id), line(juice.id)],
  });
  const agave = await create("Agave only", {
    method: "stirred",
    tags: ["Classic"],
    ingredients: [line(family.id), line(mixer.id)],
  });
  await create("Neither", { ingredients: [line(juice.id)] });
  const ids = async (query: string): Promise<string[]> =>
    (await list(query)).items.map(({ id }) => id);

  expect(await ids(`alcohol=${family.id},${other.id}`)).toEqual([both.id]);
  expect(await ids(`alcohol=${family.id}`)).toEqual([agave.id, both.id]);
  expect(await ids(`alcohol=${family.id}&mixer=${mixer.id}`)).toEqual([agave.id]);
  expect(await ids(`mixer=${mixer.id},${juice.id}`)).toEqual([]);
  expect(await ids(`mixer=${juice.id}`)).toHaveLength(2);
  const [classic, sour] = both.tags;
  expect(await ids(`tag=${classic?.id},${sour?.id}`)).toEqual([both.id]);
  expect(await ids(`method=stirred,built`)).toEqual([agave.id]);
  for (const query of ["alcohol=", "method=shaken,nope", `tag=${newId()},`]) {
    expect((await app.request(`${path}?${query}`)).status).toBe(400);
  }
  const many = Array.from({ length: 21 }, () => newId()).join(",");
  expect((await app.request(`${path}?tag=${many}`)).status).toBe(400);
});
