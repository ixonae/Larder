import {
  type Category,
  cocktailDetailSchema,
  type PantryIngredient,
  type Product,
} from "@larder/shared";
import { expect, test } from "vitest";
import type { Db } from "../../db/client.ts";
import { categories, pantryIngredients, products } from "../../db/schema/index.ts";
import { createTestApp, errorOf, jsonRequest, readJson, type TestApp } from "../../test/app.ts";

async function setup(): Promise<{
  app: TestApp["app"];
  bar: string;
  db: Db;
  bob: { userId: string; barId: string };
  path: string;
  root: Category;
  category: Category;
  product: string;
  fallback: string;
  pantry: string;
  save: (ingredients: unknown) => Response | Promise<Response>;
}> {
  const { app, alice, bob, db } = createTestApp();
  const bar = `/api/bars/${alice.barId}`;
  const path = `${bar}/cocktails`;
  async function create<T>(entity: string, input: object): Promise<T> {
    const response = await app.request(`${bar}/${entity}`, jsonRequest("POST", input));
    expect(response.status).toBe(201);
    return readJson<T>(response);
  }
  const root = await create<Category>("categories", {
    name: "Herbal",
    kind: "liqueur",
    default_abv: 33,
  });
  const category = await create<Category>("categories", { name: "Menthol", parent_id: root.id });
  const { id: product } = await create<Product>("products", {
    name: "Mentha",
    category_id: category.id,
    abv: 24,
  });
  const { id: fallback } = await create<Product>("products", {
    name: "Other Mentha",
    category_id: category.id,
  });
  const pantryCategory = await create<Category>("categories", { name: "Herbs", kind: "garnish" });
  const { id: pantry } = await create<PantryIngredient>("pantry-ingredients", {
    name: "Mint sprig",
    category_id: pantryCategory.id,
  });
  const save = (ingredients: unknown): Response | Promise<Response> =>
    app.request(path, jsonRequest("POST", { name: "Mint Cooler", method: "built", ingredients }));
  return { app, bar, db, bob, path, root, category, product, fallback, pantry, save };
}

test("resolves ingredients and ordered alternatives with paths, ABV and preparation notes", async () => {
  const { app, path, root, category, product, fallback, pantry, save } = await setup();
  const res = await save([
    {
      category_id: category.id,
      amount: 30,
      unit: "ml",
      note: "  Chill ",
      alternatives: [
        { product_id: product, note: "  Stir first " },
        { product_id: fallback },
        { pantry_ingredient_id: pantry },
      ],
    },
    { pantry_ingredient_id: pantry, unit: "to_taste", optional: true },
    { product_id: product, category_id: null, unit: "top", amount: null },
  ]);
  expect(res.status).toBe(201);
  const result = cocktailDetailSchema.parse(await res.json());
  const categoryPath = [
    { id: root.id, name: root.name },
    { id: category.id, name: category.name },
  ];
  expect(result.ingredients).toMatchObject([
    {
      position: 0,
      category_id: category.id,
      amount: 30,
      unit: "ml",
      optional: false,
      note: "Chill",
      name: category.name,
      category_path: categoryPath,
      abv: 33,
      alternatives: [
        {
          position: 0,
          product_id: product,
          name: "Mentha",
          note: "Stir first",
          abv: 24,
          category_path: categoryPath,
        },
        { position: 1, product_id: fallback, name: "Other Mentha", note: null, abv: 33 },
        { position: 2, pantry_ingredient_id: pantry, name: "Mint sprig", abv: 0 },
      ],
    },
    {
      position: 1,
      pantry_ingredient_id: pantry,
      amount: null,
      optional: true,
      alternatives: [],
      abv: 0,
    },
    { position: 2, product_id: product, amount: null, unit: "top", alternatives: [], abv: 24 },
  ]);
  const url = `${path}/${result.id}`;
  expect(await (await app.request(url)).json()).toEqual(result);
  const renamed = await app.request(url, jsonRequest("PATCH", { name: "Mint Fizz" }));
  expect(await renamed.json()).toMatchObject({
    name: "Mint Fizz",
    ingredients: result.ingredients,
  });
  const cleared = await app.request(url, jsonRequest("PATCH", { ingredients: [] }));
  expect(await cleared.json()).toMatchObject({ name: "Mint Fizz", ingredients: [] });
});

test("rejects missing or multiple sources, including alternatives, and measured units without amounts", async () => {
  const { category, product, save } = await setup();
  for (const invalid of [
    { amount: 20, unit: "ml" },
    { category_id: category.id, product_id: product, amount: 20, unit: "ml" },
    { product_id: product, amount: null, unit: "oz" },
    { product_id: product, amount: 1, unit: "ml", alternatives: [{}] },
  ]) {
    expect((await save([invalid])).status).toBe(400);
  }
});

test("cocktail update that fails after inserting a valid ingredient rolls back the entire recipe", async () => {
  const { app, db, bob, path, category, product, pantry, save } = await setup();
  const audit = { bar_id: bob.barId, created_by: bob.userId };
  const foreignCategory = db
    .insert(categories)
    .values({ ...audit, name: category.name, kind: "liqueur" })
    .returning()
    .get();
  const foreignProduct = db
    .insert(products)
    .values({ ...audit, name: "Mentha", category_id: foreignCategory.id })
    .returning()
    .get();
  const foreignPantry = db
    .insert(pantryIngredients)
    .values({ ...audit, name: "Mint sprig", category_id: foreignCategory.id })
    .returning()
    .get();
  const originalLine = {
    product_id: product,
    unit: "top",
    alternatives: [{ pantry_ingredient_id: pantry }],
  };
  for (const source of [
    { category_id: foreignCategory.id },
    { product_id: foreignProduct.id },
    { pantry_ingredient_id: foreignPantry.id },
  ]) {
    expect((await save([originalLine, { ...source, unit: "top" }])).status).toBe(400);
  }
  expect(await (await app.request(path)).json()).toEqual({ items: [], next_cursor: null });
  const recipe = cocktailDetailSchema.parse(await (await save([originalLine])).json());
  const url = `${path}/${recipe.id}`;
  const invalid = await app.request(
    url,
    jsonRequest("PATCH", {
      name: "Changed",
      ingredients: [
        { category_id: category.id, amount: 50, unit: "ml" },
        {
          product_id: product,
          unit: "top",
          alternatives: [{ pantry_ingredient_id: foreignPantry.id }],
        },
      ],
    }),
  );
  expect(invalid.status).toBe(400);
  expect((await errorOf(invalid)).details).toMatchObject([
    { path: ["ingredients", 1, "alternatives", 0] },
  ]);
  expect(await (await app.request(url)).json()).toEqual(recipe);
});

test("deleting any preferred or alternative source in use is refused and nothing is deleted", async () => {
  const { app, bar, path, root, category, product, fallback, pantry, save } = await setup();
  const recipe = cocktailDetailSchema.parse(
    await (
      await save([
        {
          category_id: category.id,
          unit: "top",
          alternatives: [
            { category_id: root.id },
            { product_id: product },
            { pantry_ingredient_id: pantry },
            { category_id: category.id },
          ],
        },
        { product_id: fallback, unit: "top" },
      ])
    ).json(),
  );
  for (const endpoint of [
    `categories/${category.id}`,
    `categories/${root.id}`,
    `products/${product}`,
    `products/${fallback}`,
    `pantry-ingredients/${pantry}`,
  ]) {
    const url = `${bar}/${endpoint}`;
    const response = await app.request(url, { method: "DELETE" });
    expect(response.status).toBe(409);
    const usage = (await errorOf(response)).details as { used_by: { type: string }[] };
    expect(usage.used_by.filter((item) => item.type === "cocktail")).toEqual([
      { type: "cocktail", id: recipe.id, name: recipe.name },
    ]);
    expect((await app.request(url)).status).toBe(200);
  }
  expect(await (await app.request(`${path}/${recipe.id}`)).json()).toEqual(recipe);
  expect((await app.request(`${path}/${recipe.id}`, { method: "DELETE" })).status).toBe(204);
  expect((await app.request(`${bar}/products/${product}`, { method: "DELETE" })).status).toBe(204);
});
