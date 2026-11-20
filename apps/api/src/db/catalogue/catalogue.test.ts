import { readdir, readFile } from "node:fs/promises";
import {
  barSummarySchema,
  categorySchema,
  cocktailDetailSchema,
  imageSchema,
  newId,
  pageSchema,
  pantryIngredientSchema,
  utensilSchema,
} from "@larder/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
import { createTestApp, jsonRequest } from "../../test/app.ts";
import {
  barDataMigrations,
  barMembers,
  bars,
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
import {
  type Catalogue,
  catalogueSourceSchema,
  categoryPictureKey,
  importCatalogue,
} from "./import.ts";
import { migrateStarterCatalogues, seedStarterCatalogue, skipStarterCatalogue } from "./starter.ts";

it("bundles a transparent original and thumbnail for each catalogue icon", async () => {
  for (const directory of ["category-icons", "glassware-icons", "tool-icons"]) {
    const root = new URL(`./${directory}/`, import.meta.url);
    const originals = (await readdir(root)).filter((name) => name.endsWith(".webp")).sort();
    const thumbnails = (await readdir(new URL("thumbnails/", root))).sort();
    expect(thumbnails).toEqual(originals);
    for (const name of originals) {
      for (const [path, side] of [
        [name, 512],
        [`thumbnails/${name}`, 256],
      ] as const) {
        const image = sharp(await readFile(new URL(path, root)));
        expect(await image.metadata(), path).toMatchObject({
          format: "webp",
          width: side,
          height: side,
          hasAlpha: true,
        });
        await image.raw().toBuffer();
      }
    }
  }
});

it("seeds and serves compact pictures throughout the starter category tree", async () => {
  const { app, db } = createTestApp();
  const response = await app.request(
    "/api/bars",
    jsonRequest("POST", { name: "Starter bar", seed_data: true }),
  );
  expect(response.status).toBe(201);
  const { id } = barSummarySchema.parse(await response.json());
  const rows = db.select().from(categories).where(eq(categories.bar_id, id)).all();
  const illustrated = rows.filter(({ parent_id }) => parent_id === null);
  expect(illustrated.map(({ name }) => name).sort()).toEqual([
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

  for (const { image_id } of illustrated) {
    const icon = await app.request(`/api/images/${image_id}/thumb`);
    expect(icon.status).toBe(200);
    expect(await sharp(Buffer.from(await icon.arrayBuffer())).metadata()).toMatchObject({
      width: 256,
      height: 256,
      hasAlpha: true,
    });
  }

  const children = rows.filter(({ parent_id }) => parent_id !== null);
  expect(children).toHaveLength(633);
  expect(children.every(({ image_id }) => image_id !== null)).toBe(true);
  const imageIds = new Set(children.map(({ image_id }) => image_id));
  expect(imageIds.size).toBe(52);

  for (const id of imageIds) {
    const response = await app.request(`/api/images/${id}/thumb`);
    expect(response.status).toBe(200);
    const bytes = await response.arrayBuffer();
    expect(bytes.byteLength).toBeLessThanOrEqual(6_000);
    expect(await sharp(Buffer.from(bytes)).metadata()).toMatchObject({
      format: "webp",
      width: 160,
      height: 160,
      hasAlpha: true,
    });
  }

  const categoryImage = (...path: string[]) => {
    let parent: string | null = null;
    let category: (typeof rows)[number] | undefined;
    for (const name of path) {
      category = rows.find((row) => row.parent_id === parent && row.name === name);
      parent = category?.id ?? null;
    }
    return category?.image_id;
  };
  const gin = categoryImage("Spirit", "Gin");
  expect(categoryImage("Spirit", "Gin", "Dry gin", "London dry gin")).toBe(gin);
  expect(categoryImage("Spirit", "Vodka")).not.toBe(gin);
  const red = categoryImage("Wine", "Red wine", "France", "Bordeaux");
  const white = categoryImage("Wine", "White wine", "Dry white wine", "France", "Bordeaux");
  expect(red).toBe(categoryImage("Wine", "Red wine"));
  expect(white).toBe(categoryImage("Wine", "White wine"));
  expect(red).not.toBe(white);
  const orangeLiqueur = categoryImage("Liqueur", "Orange liqueur");
  expect(orangeLiqueur).not.toBe(categoryImage("Juice", "Orange juice"));
  expect(categoryImage("Liqueur", "Orange liqueur", "Orange curaçao")).toBe(orangeLiqueur);
  expect(categoryImage("Liqueur", "Orange liqueur", "Blue curaçao")).not.toBe(orangeLiqueur);
  expect(categoryImage("Bitters", "Orange bitters")).toBe(
    categoryImage("Bitters", "Aromatic bitters"),
  );

  const pantry = db.select().from(pantryIngredients).where(eq(pantryIngredients.bar_id, id)).all();
  const pantryImages = new Set(pantry.map(({ image_id }) => image_id));
  const alcohol = new Set(["beer", "bitters", "liqueur", "spirit", "wine"]);
  expect(
    children.filter(
      (category) => alcohol.has(category.kind) && pantryImages.has(category.image_id),
    ),
  ).toEqual([]);
  expect(categoryImage("Syrup", "Orgeat")).toBe(
    pantry.find(({ name }) => name === "Orgeat")?.image_id,
  );
});

it("gives every starter pantry ingredient a compact picture on new bars", async () => {
  const { app } = createTestApp();
  const response = await app.request(
    "/api/bars",
    jsonRequest("POST", { name: "Stocked bar", seed_data: true }),
  );
  const { id } = barSummarySchema.parse(await response.json());
  const list = await app.request(`/api/bars/${id}/pantry-ingredients?limit=100`);
  const { items } = pageSchema(pantryIngredientSchema).parse(await list.json());
  expect(items).toHaveLength(59);
  expect(items.every(({ image_id }) => image_id !== null)).toBe(true);
  const directory = new URL("./pantry-icons/", import.meta.url);
  expect(await readdir(directory)).toHaveLength(items.length);
  for (const { image_id } of items) {
    const response = await app.request(`/api/images/${image_id}/thumb`);
    expect(response.status).toBe(200);
    const bytes = await response.arrayBuffer();
    expect(bytes.byteLength).toBeLessThanOrEqual(6_000);
    expect(await sharp(Buffer.from(bytes)).metadata()).toMatchObject({
      format: "webp",
      width: 160,
      height: 160,
      hasAlpha: true,
    });
  }
});

it("seeds high-resolution cocktail illustrations with lightweight thumbnails", async () => {
  const { app, db } = createTestApp();
  const response = await app.request(
    "/api/bars",
    jsonRequest("POST", { name: "Illustrated bar", seed_data: true }),
  );
  expect(response.status).toBe(201);
  const { id } = barSummarySchema.parse(await response.json());
  const recipes = db.select().from(cocktails).where(eq(cocktails.bar_id, id)).all();
  expect(recipes).toHaveLength(134);
  expect(recipes.every(({ image_id }) => image_id !== null)).toBe(true);

  const folder = new URL("./cocktail-icons/", import.meta.url);
  const thumbnailFolder = new URL("thumbnails/", folder);
  const thumbnails = (await readdir(thumbnailFolder)).sort();
  const files = (await readdir(folder)).filter((name) => name.endsWith(".webp")).sort();
  expect(thumbnails).toEqual(files);
  const manifest = await readFile(new URL("./cocktail-art.txt", import.meta.url), "utf8");
  const groups = manifest
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("|") as [string, string, string, string]);
  expect(files.map((file) => `cocktail-icons/${file}`)).toEqual(
    groups.map(([path]) => `${path}.webp`).sort(),
  );
  const recipeIds = groups.flatMap(([, , , group]) => group.split(" "));
  expect(recipeIds).toHaveLength(recipes.length);
  expect(new Set(recipeIds).size).toBe(recipes.length);

  const starterRecipes = new Map<string, { glass: string; ice: string; name: string }>();
  for (const filename of ["classic-recipes.jsonl", "basic-recipes.jsonl"]) {
    const content = await readFile(new URL(filename, import.meta.url), "utf8");
    for (const line of content.trim().split(/\r?\n/)) {
      const recipe = JSON.parse(line);
      starterRecipes.set(recipe.id, recipe);
    }
  }
  const cocktailsByName = new Map(recipes.map((recipe) => [recipe.name, recipe]));
  const imageIds = new Set<string>();
  let fullSize = 0;
  for (const [path, glass, ice, group] of groups) {
    const groupIds = new Set(
      group.split(" ").map((recipeId) => {
        const recipe = starterRecipes.get(recipeId);
        expect(recipe?.glass, `${path} → ${recipeId}`).toBe(glass);
        expect(ice.split(","), `${path} → ${recipeId}`).toContain(recipe?.ice);
        return cocktailsByName.get(recipe?.name ?? "")?.image_id;
      }),
    );
    expect(groupIds.size, path).toBe(1);
    const [imageId] = groupIds;
    expect(imageId, path).toEqual(expect.any(String));
    imageIds.add(imageId as string);
    const full = await app.request(`/api/images/${imageId}`);
    const thumb = await app.request(`/api/images/${imageId}/thumb`);
    expect(full.status).toBe(200);
    expect(thumb.status).toBe(200);
    const fullBytes = Buffer.from(await full.arrayBuffer());
    const thumbBytes = Buffer.from(await thumb.arrayBuffer());
    expect(fullBytes).toEqual(await readFile(new URL(`./${path}.webp`, import.meta.url)));
    expect(thumbBytes).toEqual(
      await readFile(new URL(`${path.slice("cocktail-icons/".length)}.webp`, thumbnailFolder)),
    );
    expect(thumbBytes.byteLength).toBeLessThanOrEqual(16_000);
    fullSize += fullBytes.byteLength;
    expect(await sharp(fullBytes).metadata()).toMatchObject({
      format: "webp",
      hasAlpha: true,
      width: 768,
      height: 768,
    });
    expect(await sharp(thumbBytes).metadata()).toMatchObject({
      format: "webp",
      hasAlpha: true,
      width: 384,
      height: 384,
    });
  }

  expect(fullSize).toBeLessThanOrEqual(5_500_000);
  expect(imageIds.size).toBe(groups.length);
  const imageFor = (name: string) => cocktailsByName.get(name)?.image_id;
  expect(imageFor("Daiquiri")).toBe(imageFor("White Lady"));
  expect(imageFor("Espresso Martini")).not.toBe(imageFor("Daiquiri"));
});

it("offers bottled alternatives for every fresh juice line in the starter catalogue", async () => {
  const { app, db, storage, alice } = createTestApp();
  await seedStarterCatalogue(db, storage, alice.barId);
  const base = `/api/bars/${alice.barId}/cocktails`;
  const recipes = db.select().from(cocktails).where(eq(cocktails.bar_id, alice.barId)).all();
  let freshJuiceLines = 0;
  const fruits = new Set(["Lemon", "Lime", "Orange", "Pineapple"]);

  for (const { id, name } of recipes) {
    const response = await app.request(`${base}/${id}`);
    const { ingredients } = cocktailDetailSchema.parse(await response.json());
    for (const line of ingredients) {
      if (!line.pantry_ingredient_id || !fruits.has(line.name)) continue;

      const bottled = line.alternatives.find(({ name }) => name === `${line.name} juice`);
      if (line.unit === "ml") {
        freshJuiceLines++;
        expect(bottled, name).toMatchObject({ category_id: expect.any(String) });
      } else {
        expect(bottled, name).toBeUndefined();
      }
    }
  }

  expect(freshJuiceLines).toBe(79);
});

it("backfills only matching roots in a previously seeded bar and preserves custom images", async () => {
  const { app, db, storage, alice } = createTestApp();
  const base = `/api/bars/${alice.barId}/categories`;
  const rows = () => db.select().from(categories).where(eq(categories.bar_id, alice.barId)).all();
  const beer = rows().find(({ name }) => name === "Beer");
  const spirit = rows().find(({ name }) => name === "Spirit");
  const custom = new FormData();
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  custom.append("file", new File([new Uint8Array(bytes)], "custom.png", { type: "image/png" }));
  const upload = await app.request(`${base}/${beer?.id}/image`, { method: "PUT", body: custom });
  expect(upload.status).toBe(200);
  const { id: customId } = imageSchema.parse(await upload.json());
  const add = async (body: unknown) => {
    const res = await app.request(base, jsonRequest("POST", body));
    expect(res.status).toBe(201);
    return categorySchema.parse(await res.json());
  };
  const child = await add({ name: "Spirit", parent_id: spirit?.id, kind: "spirit" });
  const wine = rows().find(({ name }) => name === "Wine");
  expect(
    (await app.request(`${base}/${wine?.id}`, jsonRequest("PATCH", { name: "House wine" }))).status,
  ).toBe(200);
  const otherWine = await add({ name: "Wine", kind: "other" });
  const mixer = rows().find(({ name }) => name === "Mixer");
  expect(
    (await app.request(`${base}/${mixer?.id}`, jsonRequest("PATCH", { name: "House mixers" })))
      .status,
  ).toBe(200);
  db.insert(barDataMigrations)
    .values({ bar_id: alice.barId, migration: "starter-catalogue-v1" })
    .run();

  await seedStarterCatalogue(db, storage, alice.barId);
  const after = rows();
  expect(after.find(({ id }) => id === beer?.id)?.image_id).toBe(customId);
  expect(after.find(({ id }) => id === spirit?.id)?.image_id).toEqual(expect.any(String));
  expect(after.find(({ id }) => id === child.id)?.image_id).toBeNull();
  expect(after.find(({ id }) => id === otherWine.id)?.image_id).toBeNull();
  expect(after.some(({ name }) => name === "Mixer")).toBe(false);
  expect(db.select().from(cocktails).all()).toEqual([]);
  const imageRows = db.select().from(images).all();
  await seedStarterCatalogue(db, storage, alice.barId);
  expect(rows()).toEqual(after);
  expect(db.select().from(images).all()).toEqual(imageRows);
});

it("leaves no bar or image files when seeded bar creation fails while staging icons", async () => {
  const { app, db, storage, uploads } = createTestApp();
  const existingBars = db.select().from(bars).all();
  const existingMembers = db.select().from(barMembers).all();
  const put = storage.put;
  const writes = vi
    .spyOn(storage, "put")
    .mockImplementationOnce(put)
    .mockImplementationOnce(put)
    .mockRejectedValueOnce(new Error("Simulated image storage failure"));

  const response = await app.request(
    "/api/bars",
    jsonRequest("POST", { name: "Starter bar", seed_data: true }),
  );
  expect(response.status).toBe(500);
  expect(writes).toHaveBeenCalledTimes(4);
  expect(db.select().from(bars).all()).toEqual(existingBars);
  expect(db.select().from(barMembers).all()).toEqual(existingMembers);
  expect(db.select().from(barDataMigrations).all()).toEqual([]);
  expect(db.select().from(images).all()).toEqual([]);
  const entries = await readdir(uploads, { recursive: true, withFileTypes: true });
  expect(entries.filter((entry) => entry.isFile())).toEqual([]);
});

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

  const garnish = db
    .select()
    .from(categories)
    .where(and(eq(categories.bar_id, alice.barId), eq(categories.name, "Garnish")))
    .get();
  const citrusResponse = await app.request(
    `${base}/categories`,
    jsonRequest("POST", { name: "Citrus", parent_id: garnish?.id, kind: "garnish" }),
  );
  const citrus = categorySchema.parse(await citrusResponse.json());
  const custom = new FormData();
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  custom.append("file", new File([new Uint8Array(bytes)], "custom.png", { type: "image/png" }));
  const pantryBase = `${base}/pantry-ingredients`;
  const added = await app.request(
    pantryBase,
    jsonRequest("POST", { name: "Lemon", category_id: citrus.id }),
  );
  const nestedLemon = pantryIngredientSchema.parse(await added.json());
  const egg = db
    .select()
    .from(pantryIngredients)
    .where(and(eq(pantryIngredients.bar_id, alice.barId), eq(pantryIngredients.name, "Egg")))
    .get();
  const eggUpload = await app.request(`${pantryBase}/${egg?.id}/image`, {
    method: "PUT",
    body: custom,
  });
  const eggImage = imageSchema.parse(await eggUpload.json());
  skipStarterCatalogue(db, bob.barId);
  skipStarterCatalogue(db, bob.barId);
  await migrateStarterCatalogues(db, storage);
  const pantryRows = db
    .select()
    .from(pantryIngredients)
    .where(eq(pantryIngredients.bar_id, alice.barId))
    .all();
  expect(pantryRows).toHaveLength(60);
  expect(pantryRows.find(({ id }) => id === egg?.id)?.image_id).toBe(eggImage.id);
  expect(pantryRows.filter(({ image_id }) => image_id === null).map(({ id }) => id)).toEqual([
    nestedLemon.id,
  ]);
  const imported = db.select().from(cocktails).where(eq(cocktails.bar_id, alice.barId)).all();
  expect(imported).toHaveLength(134);
  expect(imported.find(({ name }) => name === "NEGRONI")).toMatchObject({
    method: "other",
    source: null,
  });
  const negroni = await app.request(
    `${base}/cocktails/${imported.find(({ name }) => name === "NEGRONI")?.id}`,
  );
  expect(cocktailDetailSchema.parse(await negroni.json()).tools).toEqual([]);
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
    image_id: expect.any(String),
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
  expect(categoryRows.filter(({ parent_id, image_id }) => parent_id !== null && !image_id)).toEqual(
    [],
  );
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

it("seeds transparent icons for standalone glassware and keeps an existing custom picture", async () => {
  const { app, db, storage, alice, bob } = createTestApp();
  skipStarterCatalogue(db, bob.barId);
  const base = `/api/bars/${alice.barId}`;
  const create = await app.request(
    `${base}/utensils`,
    jsonRequest("POST", { name: "COLLINS GLASS", kind: "glass", capacity_ml: 350 }),
  );
  expect(create.status).toBe(201);
  const collins = utensilSchema.parse(await create.json());
  const custom = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append("file", new File([new Uint8Array(custom)], "collins.png", { type: "image/png" }));
  const upload = await app.request(`${base}/utensils/${collins.id}/image`, {
    method: "PUT",
    body: form,
  });
  expect(upload.status).toBe(200);
  const uploaded = imageSchema.parse(await upload.json());
  const list = async () => {
    const res = await app.request(`${base}/utensils?kind=glass`);
    expect(res.status).toBe(200);
    return pageSchema(utensilSchema).parse(await res.json()).items;
  };

  await migrateStarterCatalogues(db, storage);
  const glasses = await list();
  expect(glasses.find(({ id }) => id === collins.id)).toMatchObject({
    name: collins.name,
    capacity_ml: collins.capacity_ml,
    image_id: uploaded.id,
  });
  expect(glasses.filter(({ name }) => name.toLowerCase() === "collins glass")).toHaveLength(1);
  const shot = glasses.find(({ name }) => name === "Shot glass");
  expect(shot).toMatchObject({ kind: "glass", image_id: expect.any(String) });
  for (const [suffix, side] of [
    ["", 512],
    ["/thumb", 256],
  ] as const) {
    const icon = await app.request(`/api/images/${shot?.image_id}${suffix}`);
    expect(icon.status).toBe(200);
    expect(icon.headers.get("content-type")).toBe("image/webp");
    expect(await sharp(Buffer.from(await icon.arrayBuffer())).metadata()).toMatchObject({
      width: side,
      height: side,
      hasAlpha: true,
    });
  }
  expect(db.select().from(utensils).where(eq(utensils.bar_id, bob.barId)).all()).toEqual([]);

  expect((await app.request(`${base}/utensils/${shot?.id}`, { method: "DELETE" })).status).toBe(
    204,
  );
  await migrateStarterCatalogues(db, storage);
  expect(await list()).toEqual(glasses.filter(({ id }) => id !== shot?.id));
});

it("imports preparation tools and numbered actions without default tags or source links", async () => {
  const { app, db, storage, alice } = createTestApp();
  const base = `/api/bars/${alice.barId}`;
  await seedStarterCatalogue(db, storage, alice.barId);
  const imported = db.select().from(cocktails).where(eq(cocktails.bar_id, alice.barId)).all();
  expect(imported).toHaveLength(134);
  expect(imported.every(({ image_id }) => image_id !== null)).toBe(true);
  expect(imported.every(({ source }) => source === null)).toBe(true);
  expect(db.select().from(tags).all()).toEqual([]);
  expect(db.select().from(cocktailTags).all()).toEqual([]);

  const id = imported.find(({ name }) => name === "Dry Martini")?.id;
  const response = await app.request(`${base}/cocktails/${id}`);
  expect(response.status).toBe(200);
  const { steps, tools } = cocktailDetailSchema.parse(await response.json());
  expect(tools.map(({ name }) => name)).toEqual([
    "Bar spoon",
    "Jigger",
    "Julep strainer",
    "Mixing glass",
  ]);
  expect(steps.map(({ text }) => text)).toEqual([
    "Chill a martini glass.",
    "Measure the gin and dry vermouth into a mixing glass.",
    "Stir over ice until the mixture is thoroughly cold and lightly diluted.",
    "Strain into the chilled martini glass.",
    "Finish with lemon oils or a green olive.",
  ]);
  for (const [name, expectedIngredients, expectedTools] of [
    [
      "Gin and Tonic",
      [
        { name: "Gin", amount: 50 },
        { name: "Tonic water", amount: 150 },
      ],
      ["Bar spoon", "Jigger"],
    ],
    [
      "Godfather",
      [
        { name: "Blended Scotch", amount: 50 },
        { name: "Amaretto", amount: 25 },
      ],
      ["Bar spoon", "Ice tongs", "Jigger"],
    ],
  ] as const) {
    const id = imported.find((recipe) => recipe.name === name)?.id;
    const response = await app.request(`${base}/cocktails/${id}`);
    expect(response.status).toBe(200);
    const recipe = cocktailDetailSchema.parse(await response.json());
    expect(recipe.tags).toEqual([]);
    expect(recipe.tools.map(({ name }) => name)).toEqual(expectedTools);
    expect(recipe.ingredients.slice(0, 2)).toMatchObject(
      expectedIngredients.map((ingredient) => ({ ...ingredient, unit: "ml" })),
    );
    expect(recipe.steps.map(({ position }) => position)).toEqual(recipe.steps.map((_, i) => i));
  }
  for (const [name, expectedTools] of [
    ["Don’s Special Daiquiri", ["Citrus juicer", "Drink mixer", "Ice scoop", "Jigger"]],
    ["Espresso Martini", ["Fine-mesh strainer", "Jigger", "Shaker"]],
    ["Mojito", ["Bar spoon", "Citrus juicer", "Jigger", "Muddler"]],
    ["Piña Colada", ["Blender", "Jigger"]],
  ] as const) {
    const id = imported.find((recipe) => recipe.name === name)?.id;
    const response = await app.request(`${base}/cocktails/${id}`);
    const recipe = cocktailDetailSchema.parse(await response.json());
    expect(recipe.tools.map(({ name }) => name)).toEqual(expectedTools);
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
  const filtered = await app.request(`${base}?q=Sazerac&alcohol=${absinthe?.id}`);
  expect(await filtered.json()).toMatchObject({ items: [] });
});

it("stores a bottle's country code and region, and refuses an unknown code", async () => {
  const { db, storage, alice } = createTestApp();
  const source = {
    key: "bottle",
    type: "product",
    name: "Skye bottle",
    kind: "spirit",
    path: ["Other spirits"],
    country: "GB",
    region: "Skye",
  };
  const pack: Catalogue = {
    ...sample,
    id: "country-v1",
    sources: [catalogueSourceSchema.parse(source)],
  };
  await importCatalogue(db, storage, alice.barId, pack);
  await importCatalogue(db, storage, alice.barId, pack);
  const bottles = db.select().from(products).where(eq(products.name, "Skye bottle")).all();
  expect(bottles).toHaveLength(1);
  expect(bottles[0]).toMatchObject({ country: "GB", region: "Skye" });
  for (const country of ["Scotland", "gb", "XX"]) {
    expect(catalogueSourceSchema.safeParse({ ...source, country }).success).toBe(false);
  }
  expect(catalogueSourceSchema.parse({ ...source, country: undefined })).toMatchObject({
    name: "Skye bottle",
  });
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

it("keeps shared catalogue images until their last owner removes them", async () => {
  const { app, db, storage, uploads, alice } = createTestApp();
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } })
    .webp()
    .toBuffer();
  const picture = { full: bytes, thumb: bytes, width: 10, height: 10 };
  const paths = [
    ["Wine", "House red"],
    ["Wine", "House rosé"],
  ] as const;
  await importCatalogue(db, storage, alice.barId, {
    id: "shared-category-pictures",
    categories: paths.map((path) => ({ kind: "wine", path: [...path] })),
    recipes: [],
    sources: [],
    pictures: new Map(paths.map((path) => [categoryPictureKey(path), picture])),
  });

  const rows = db.select().from(categories).where(eq(categories.bar_id, alice.barId)).all();
  const first = rows.find(({ name }) => name === "House red");
  const second = rows.find(({ name }) => name === "House rosé");
  const imageId = first?.image_id;
  expect(imageId).toEqual(expect.any(String));
  expect(second?.image_id).toBe(imageId);
  expect(db.select().from(images).all()).toHaveLength(1);
  const image = `/api/images/${imageId}/thumb`;

  const base = `/api/bars/${alice.barId}/categories`;
  expect((await app.request(`${base}/${first?.id}`, { method: "DELETE" })).status).toBe(204);
  expect((await app.request(image)).status).toBe(200);
  expect((await app.request(`${base}/${second?.id}/image`, { method: "DELETE" })).status).toBe(204);
  expect((await app.request(image)).status).toBe(404);
  expect(db.select().from(images).all()).toEqual([]);
  expect(await readdir(`${uploads}/${alice.barId}`)).toEqual([]);
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
  await expect(
    importCatalogue(db, storage, alice.barId, {
      ...sample,
      recipes: sample.recipes.map((recipe) => ({ ...recipe, tools: ["Unknown tool"] })),
    }),
  ).rejects.toThrow("Unknown catalogue reference: unknown tool");
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
