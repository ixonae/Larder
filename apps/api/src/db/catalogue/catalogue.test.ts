import { cocktailDetailSchema, newId } from "@larder/shared";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { expect, it } from "vitest";
import { createTestApp, jsonRequest } from "../../test/app.ts";
import {
  barDataMigrations,
  categories,
  cocktailSteps,
  cocktails,
  cocktailTags,
  images,
  pantryIngredients,
  products,
  tags,
  utensils,
} from "../schema/index.ts";
import { type Catalogue, categoryPictureKey, importCatalogue } from "./import.ts";
import { migrateStarterCatalogues, seedStarterCatalogue, skipStarterCatalogue } from "./starter.ts";

it("backfills the starter catalogue once, reuses existing entries and honors another bar's opt-out", async () => {
  const { app, db, storage, alice, bob } = createTestApp();
  const base = `/api/bars/${alice.barId}`;
  const create = await app.request(
    `${base}/cocktails`,
    jsonRequest("POST", { name: "NEGRONI", method: "other", tags: ["House"] }),
  );
  expect(create.status).toBe(201);
  const audit = { bar_id: alice.barId, created_by: alice.userId };
  db.insert(utensils)
    .values([
      { ...audit, name: "Coupe", kind: "tool" },
      { ...audit, name: "Coupe (glass)", kind: "tool" },
    ])
    .run();
  const liqueur = db
    .select()
    .from(categories)
    .where(eq(categories.bar_id, alice.barId))
    .all()
    .find(({ name }) => name === "Liqueur");
  db.insert(products)
    .values({
      ...audit,
      name: "CAMPARI",
      in_bar: true,
      abv: 21,
      category_id: liqueur?.id as string,
    })
    .run();

  skipStarterCatalogue(db, bob.barId);
  skipStarterCatalogue(db, bob.barId);
  await migrateStarterCatalogues(db, storage);
  const imported = db.select().from(cocktails).where(eq(cocktails.bar_id, alice.barId)).all();
  expect(imported).toHaveLength(134);
  expect(imported.find(({ name }) => name === "NEGRONI")).toMatchObject({
    method: "other",
    source: null,
  });
  const steps = db
    .select()
    .from(cocktailSteps)
    .where(eq(cocktailSteps.bar_id, alice.barId))
    .orderBy(cocktailSteps.position)
    .all();
  for (const recipe of imported.filter(({ name }) => name !== "NEGRONI")) {
    const recipeSteps = steps.filter(({ cocktail_id }) => cocktail_id === recipe.id);
    expect(recipeSteps.length, recipe.name).toBeGreaterThanOrEqual(3);
    expect(
      recipeSteps.map(({ position }) => position),
      recipe.name,
    ).toEqual(recipeSteps.map((_, i) => i));
  }
  const alexander = imported.find(({ name }) => name === "Alexander");
  const response = await app.request(`${base}/cocktails/${alexander?.id}`);
  expect(response.status).toBe(200);
  expect(cocktailDetailSchema.parse(await response.json())).toMatchObject({
    ingredients: [
      { name: "Cognac", amount: 30, unit: "ml" },
      { name: "Crème de cacao (dark)", amount: 30, unit: "ml" },
      { name: "Cream", amount: 30, unit: "ml" },
      { name: "Nutmeg", optional: true },
    ],
    tags: [],
    steps: [
      { position: 0, text: "Chill a coupe." },
      { position: 1, text: expect.stringContaining("dark crème de cacao") },
      { position: 2, text: expect.stringContaining("Shake with ice") },
      { position: 3, text: "Strain into the coupe." },
      { position: 4, text: expect.stringContaining("nutmeg") },
    ],
    source: null,
  });
  expect(
    db
      .select()
      .from(utensils)
      .where(eq(utensils.id, alexander?.glass_id as string))
      .get(),
  ).toMatchObject({
    name: "Coupe (glass 2)",
    kind: "glass",
  });
  const bottleRows = db.select().from(products).where(eq(products.bar_id, alice.barId)).all();
  expect(bottleRows.filter(({ in_bar }) => in_bar)).toMatchObject([{ name: "CAMPARI", abv: 21 }]);
  expect(bottleRows.filter(({ name }) => name.toLowerCase() === "campari")).toHaveLength(1);
  expect(db.select().from(tags).all()).toMatchObject([{ name: "House" }]);
  expect(db.select().from(cocktailTags).all()).toMatchObject([
    { cocktail_id: imported.find(({ name }) => name === "NEGRONI")?.id },
  ]);
  expect(db.$client.pragma("foreign_key_check")).toEqual([]);
  expect(db.select().from(cocktails).where(eq(cocktails.bar_id, bob.barId)).all()).toEqual([]);

  const categoryRows = db.select().from(categories).where(eq(categories.bar_id, alice.barId)).all();
  function hasPath(...names: string[]) {
    let parent: string | null = null;
    for (const name of names) {
      const next: (typeof categoryRows)[number] | undefined = categoryRows.find(
        (row) => row.name === name && row.parent_id === parent,
      );
      if (!next) return false;
      parent = next.id;
    }
    return true;
  }
  expect(hasPath("Wine", "Red wine", "France", "Bordeaux", "Pauillac")).toBe(true);
  expect(hasPath("Spirit", "Tequila", "100% agave tequila", "Reposado")).toBe(true);
  expect(hasPath("Spirit", "Tequila", "100% agave tequila", "Añejo")).toBe(true);
  expect(hasPath("Spirit", "Tequila", "100% agave tequila", "Extra añejo")).toBe(true);

  await app.request(`${base}/cocktails/${alexander?.id}`, { method: "DELETE" });
  await migrateStarterCatalogues(db, storage);
  expect(db.select().from(cocktails).where(eq(cocktails.bar_id, alice.barId)).all()).toHaveLength(
    133,
  );
});

it("imports recipes without default tags or source links and serves separate numbered actions", async () => {
  const { app, db, storage, alice } = createTestApp();
  const base = `/api/bars/${alice.barId}`;
  await seedStarterCatalogue(db, storage, alice.barId);
  const imported = db.select().from(cocktails).where(eq(cocktails.bar_id, alice.barId)).all();
  expect(imported).toHaveLength(134);
  expect(imported.every(({ source }) => source === null)).toBe(true);
  expect(db.select().from(tags).all()).toEqual([]);
  expect(db.select().from(cocktailTags).all()).toEqual([]);

  const id = imported.find(({ name }) => name === "Dry Martini")?.id;
  const response = await app.request(`${base}/cocktails/${id}`);
  expect(response.status).toBe(200);
  const { steps } = cocktailDetailSchema.parse(await response.json());
  expect(steps.map(({ text }) => text)).toEqual([
    "Chill a martini glass.",
    "Measure the gin and dry vermouth into a mixing glass.",
    "Stir over ice until the mixture is thoroughly cold and lightly diluted.",
    "Strain into the chilled martini glass.",
    "Finish with lemon oils or a green olive.",
  ]);
  for (const [name, expectedIngredients] of [
    [
      "Gin and Tonic",
      [
        { name: "Gin", amount: 50 },
        { name: "Tonic water", amount: 150 },
      ],
    ],
    [
      "Godfather",
      [
        { name: "Blended Scotch", amount: 50 },
        { name: "Amaretto", amount: 25 },
      ],
    ],
  ] as const) {
    const id = imported.find((recipe) => recipe.name === name)?.id;
    const response = await app.request(`${base}/cocktails/${id}`);
    expect(response.status).toBe(200);
    const recipe = cocktailDetailSchema.parse(await response.json());
    expect(recipe.tags).toEqual([]);
    expect(recipe.ingredients.slice(0, 2)).toMatchObject(
      expectedIngredients.map((ingredient) => ({ ...ingredient, unit: "ml" })),
    );
    expect(recipe.steps.map(({ position }) => position)).toEqual(recipe.steps.map((_, i) => i));
  }
});

it("puts recipe syrups in Pantry and links the preferred ingredient to that supply", async () => {
  const { app, db, storage, alice } = createTestApp();
  await seedStarterCatalogue(db, storage, alice.barId);
  const syrup = db
    .select()
    .from(pantryIngredients)
    .where(eq(pantryIngredients.name, "Honey syrup"))
    .get();
  expect(syrup?.bar_id).toBe(alice.barId);
  expect(
    db
      .select()
      .from(products)
      .all()
      .some(({ name }) => /syrup/i.test(name)),
  ).toBe(false);
  const recipe = db.select().from(cocktails).where(eq(cocktails.name, "Spicy Fifty")).get();
  const response = await app.request(`/api/bars/${alice.barId}/cocktails/${recipe?.id}`);
  expect(response.status).toBe(200);
  expect(cocktailDetailSchema.parse(await response.json()).ingredients).toContainEqual(
    expect.objectContaining({
      pantry_ingredient_id: syrup?.id,
      name: "Honey syrup",
      amount: 10,
      unit: "ml",
    }),
  );
});

it("uses seeded bottle ABVs and excludes rinses from the served drink", async () => {
  const { app, db, storage, alice } = createTestApp();
  await seedStarterCatalogue(db, storage, alice.barId);
  const base = `/api/bars/${alice.barId}/cocktails`;
  async function getRecipe(name: string) {
    const row = db.select().from(cocktails).where(eq(cocktails.name, name)).get();
    const response = await app.request(`${base}/${row?.id}`);
    expect(response.status).toBe(200);
    return cocktailDetailSchema.parse(await response.json());
  }
  const lastWord = await getRecipe("Last Word");
  expect(lastWord.ingredients).toContainEqual(
    expect.objectContaining({ name: "Green Chartreuse", abv: 55 }),
  );
  expect(lastWord.computed.abv).toBeCloseTo(25.4);

  const sazerac = await getRecipe("Sazerac");
  expect(sazerac.ingredients).toContainEqual(
    expect.objectContaining({
      name: "Absinthe",
      amount: 10,
      unit: "ml",
      optional: false,
      preparation_only: true,
    }),
  );
  expect(sazerac.computed.volume_ml).toBeCloseTo(51.8);
  expect(sazerac.computed.abv).toBeCloseTo((50 * 40 + 1.8 * 35) / 51.8 / 1.2);
  expect(sazerac.computed.spirits.map(({ name }) => name)).toEqual(["Brandy"]);
  const absinthe = db.select().from(categories).where(eq(categories.name, "Absinthe")).get();
  const filtered = await app.request(`${base}?q=Sazerac&spirit=${absinthe?.id}`);
  expect(await filtered.json()).toMatchObject({ items: [] });
});

const sample: Catalogue = {
  id: "sample-v1",
  categories: [{ kind: "spirit", path: ["Other spirits"] }],
  sources: [
    { key: "bottle", type: "product", name: "New bottle", kind: "spirit", path: ["Other spirits"] },
  ],
  recipes: [
    {
      id: "new-recipe",
      name: "New recipe",
      glass: "New glass",
      method: "built",
      ingredients: [{ ref: "bottle", unit: "ml", amount: 30 }],
      steps: ["Pour into the glass."],
    },
  ],
};

it("can use a separate catalogue to import into a single bar and serve its bundled pictures", async () => {
  const { app, db, storage, alice, bob } = createTestApp();
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const pack: Catalogue = {
    ...sample,
    categories: [
      ...sample.categories,
      { kind: "spirit", path: ["Spirit", "Gin"] },
      { kind: "wine", path: ["Wine", "A/B"] },
      { kind: "wine", path: ["Wine", "A", "B"] },
    ],
    pictures: new Map([
      [categoryPictureKey(["Other spirits"]), bytes],
      [categoryPictureKey(["Spirit", "Gin"]), bytes],
      [categoryPictureKey(["Wine", "A/B"]), bytes],
      [categoryPictureKey(["Wine", "A", "B"]), bytes],
      ["product:New bottle", bytes],
      ["glass:New glass", bytes],
      ["cocktail:new-recipe", bytes],
      ["cocktail:unused", bytes],
    ]),
  };
  await Promise.all([
    importCatalogue(db, storage, alice.barId, pack),
    importCatalogue(db, storage, alice.barId, pack),
  ]);
  const saved = db.select().from(images).all();
  expect(saved).toHaveLength(7);
  expect(saved.every((row) => row.bar_id === alice.barId)).toBe(true);
  expect(db.select().from(cocktails).where(eq(cocktails.bar_id, bob.barId)).all()).toEqual([]);
  const category = db.select().from(categories).where(eq(categories.name, "Other spirits")).get();
  const gin = db
    .select()
    .from(categories)
    .where(eq(categories.name, "Gin"))
    .all()
    .find((row) => row.bar_id === alice.barId);
  const bottle = db.select().from(products).where(eq(products.name, "New bottle")).get();
  const glass = db.select().from(utensils).where(eq(utensils.name, "New glass")).get();
  const recipe = db.select().from(cocktails).where(eq(cocktails.name, "New recipe")).get();
  const slash = db.select().from(categories).where(eq(categories.name, "A/B")).get();
  const branch = db.select().from(categories).where(eq(categories.name, "A")).get();
  const leaf = db.select().from(categories).where(eq(categories.name, "B")).get();
  expect(leaf?.parent_id).toBe(branch?.id);
  expect(slash?.image_id).not.toBe(leaf?.image_id);
  for (const owner of [category, gin, bottle, glass, recipe, slash, leaf]) {
    expect(owner?.image_id).toBeTruthy();
    const full = await app.request(`/api/images/${owner?.image_id}`);
    const thumb = await app.request(`/api/images/${owner?.image_id}/thumb`);
    expect(full.headers.get("content-type")).toBe("image/webp");
    expect(thumb.status).toBe(200);
  }
  await importCatalogue(db, storage, alice.barId, { ...pack, id: "sample-v2" });
  expect(db.select().from(images).all()).toEqual(saved);
});

it("validates pantry and bottle categories before marking a catalogue as imported", async () => {
  const { db, storage, alice } = createTestApp();
  await expect(
    importCatalogue(db, storage, alice.barId, {
      ...sample,
      sources: [
        { key: "bottle", type: "product", name: "Ice", kind: "other", path: ["Pantry", "Freezer"] },
      ],
    }),
  ).rejects.toThrow("Choose a bottle category for Ice");
  await expect(
    importCatalogue(db, storage, alice.barId, {
      ...sample,
      sources: [
        { key: "bottle", type: "pantry", name: "Gin", kind: "spirit", path: ["Spirit", "Gin"] },
      ],
    }),
  ).rejects.toThrow("Choose a pantry category for Gin");
  expect(db.select().from(barDataMigrations).all()).toEqual([]);
  expect(db.select().from(products).all()).toEqual([]);
});

it("rolls back all rows and removes staged files when an ingredient reference is invalid", async () => {
  const { db, storage, uploads, alice } = createTestApp();
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  await expect(importCatalogue(db, storage, newId(), sample)).rejects.toThrow("Unknown bar");
  await expect(
    importCatalogue(db, storage, alice.barId, {
      ...sample,
      sources: [],
      pictures: new Map([[categoryPictureKey(["Other spirits"]), bytes]]),
    }),
  ).rejects.toThrow("Unknown catalogue reference: bottle");
  expect(db.select().from(barDataMigrations).all()).toEqual([]);
  expect(
    db.select().from(categories).where(eq(categories.name, "Other spirits")).get(),
  ).toBeUndefined();
  expect(db.select().from(utensils).all()).toEqual([]);
  expect(db.select().from(images).all()).toEqual([]);
  expect(await readdir(join(uploads, alice.barId))).toEqual([]);
  await importCatalogue(db, storage, alice.barId, sample);
  expect(db.select().from(cocktails).all()).toHaveLength(1);
});
