import { cocktailDetailSchema, tagPageSchema, type Utensil } from "@larder/shared";
import { expect, test } from "vitest";
import { tags, utensils } from "../../db/schema/index.ts";
import { createTestApp, errorOf, jsonRequest, readJson } from "../../test/app.ts";

function setup() {
  const { app, db, alice, bob } = createTestApp();
  const bar = `/api/bars/${alice.barId}`;
  const cocktails = `${bar}/cocktails`;
  const create = (name: string, recipe: object) =>
    app.request(cocktails, jsonRequest("POST", { name, method: "stirred", ...recipe }));
  const utensil = async (name: string, kind: "tool" | "glass") => {
    const res = await app.request(`${bar}/utensils`, jsonRequest("POST", { name, kind }));
    expect(res.status).toBe(201);
    return readJson<Utensil>(res);
  };
  return { app, db, bob, bar, cocktails, create, utensil };
}

test("replaces recipe lists independently, keeps step order and reuses normalized tags", async () => {
  const { app, bar, cocktails, create, utensil } = setup();
  const spoon = await utensil("Spoon", "tool");
  const jigger = await utensil("Jigger", "tool");
  const created = await create("Kir", {
    steps: [{ text: "  Pour crème  " }, { text: "Top with wine" }],
    tool_ids: [spoon.id, jigger.id, spoon.id],
    tags: ["Wine", "Crème", "CRÈME", "Aperitif"],
  });
  expect(created.status).toBe(201);
  const recipe = cocktailDetailSchema.parse(await created.json());
  expect(recipe.steps).toMatchObject([
    { position: 0, text: "Pour crème" },
    { position: 1, text: "Top with wine" },
  ]);
  expect(recipe.tools).toEqual([
    { id: jigger.id, name: "Jigger" },
    { id: spoon.id, name: "Spoon" },
  ]);
  expect(recipe.tags.map((tag) => tag.name)).toEqual(["Aperitif", "Crème", "Wine"]);

  const other = await create("Kir Royal", { tags: ["CRÈME"] });
  expect(other.status).toBe(201);
  expect(cocktailDetailSchema.parse(await other.json()).tags).toEqual(
    recipe.tags.filter((tag) => tag.name === "Crème"),
  );

  const listed = async (query: string) =>
    tagPageSchema.parse(await (await app.request(`${bar}/tags?${query}`)).json());
  const first = await listed("limit=1");
  expect(first.items).toEqual(recipe.tags.slice(0, 1));
  expect(await listed(`cursor=${first.next_cursor}`)).toEqual({
    items: recipe.tags.slice(1),
    next_cursor: null,
  });
  expect((await listed("q=RÈ")).items).toEqual(recipe.tags.filter((tag) => tag.name === "Crème"));

  const url = `${cocktails}/${recipe.id}`;
  const patched = await app.request(
    url,
    jsonRequest("PATCH", {
      steps: [{ text: "Combine in glass" }],
      tool_ids: [],
    }),
  );
  expect(patched.status).toBe(200);
  const updated = cocktailDetailSchema.parse(await patched.json());
  expect(updated.steps).toMatchObject([{ position: 0, text: "Combine in glass" }]);
  expect(updated.tools).toEqual([]);
  expect(updated.tags).toEqual(recipe.tags);
  expect(await (await app.request(url)).json()).toEqual(updated);
  const wiped = await app.request(url, jsonRequest("PATCH", { tags: [], steps: [] }));
  expect(await wiped.json()).toMatchObject({ tags: [], steps: [] });
  expect((await listed("")).items).toEqual(recipe.tags);
});

test("keeps step order across insert batches and can replace every step", async () => {
  const { app, cocktails, create } = setup();
  const steps = Array.from({ length: 251 }, (_, position) => ({ text: `Action ${position + 1}` }));
  const response = await create("Long recipe", { steps });
  expect(response.status).toBe(201);
  const recipe = cocktailDetailSchema.parse(await response.json());
  expect(recipe.steps.map(({ position, text }) => ({ position, text }))).toEqual(
    steps.map(({ text }, position) => ({ position, text })),
  );
  const replaced = await app.request(
    `${cocktails}/${recipe.id}`,
    jsonRequest("PATCH", { steps: [{ text: "Serve" }] }),
  );
  expect(replaced.status).toBe(200);
  expect(cocktailDetailSchema.parse(await replaced.json()).steps).toMatchObject([
    { position: 0, text: "Serve" },
  ]);
});

test("another bar's tool and tags stay isolated, and a glass cannot be used as a tool", async () => {
  const { app, bar, db, bob, cocktails, create, utensil } = setup();
  const audit = { bar_id: bob.barId, created_by: bob.userId };
  const foreignTool = db
    .insert(utensils)
    .values({ ...audit, name: "Shaker", kind: "tool" })
    .returning()
    .get();
  const foreignTag = db
    .insert(tags)
    .values({ ...audit, name: "Dinner" })
    .returning()
    .get();
  const { id: glassId } = await utensil("Coupe", "glass");
  const { id: localTool } = await utensil("Shaker", "tool");
  const response = await create("Dinner drink", {
    tool_ids: [localTool],
    steps: [{ text: "Stir" }],
    tags: ["Dinner"],
  });
  expect(response.status).toBe(201);
  const recipe = cocktailDetailSchema.parse(await response.json());
  expect(recipe.tags).toMatchObject([{ name: "Dinner" }]);
  expect(recipe.tags[0]?.id).not.toBe(foreignTag.id);

  const url = `${cocktails}/${recipe.id}`;
  for (const id of [foreignTool.id, glassId]) {
    const invalid = await app.request(
      url,
      jsonRequest("PATCH", {
        name: "Changed",
        steps: [{ text: "Shake" }],
        tool_ids: [id],
        tags: ["New Tag"],
      }),
    );
    expect(invalid.status).toBe(400);
    expect((await errorOf(invalid)).details).toMatchObject([{ path: ["tool_ids", 0] }]);
    expect(await (await app.request(url)).json()).toEqual(recipe);
  }
  expect((await app.request(`/api/bars/${bob.barId}/tags`)).status).toBe(403);
  expect(await (await app.request(`${bar}/tags`)).json()).toEqual({
    items: recipe.tags,
    next_cursor: null,
  });
});

test("deleting or changing the kind of a tool in use is refused until its cocktail is deleted", async () => {
  const { app, bar, cocktails, create, utensil } = setup();
  const tool = await utensil("Strainer", "tool");
  const saved = await create("Test cocktail", {
    tool_ids: [tool.id],
    tags: ["Summer"],
    steps: [{ text: "Strain" }],
  });
  expect(saved.status).toBe(201);
  const recipe = cocktailDetailSchema.parse(await saved.json());
  const toolUrl = `${bar}/utensils/${tool.id}`;
  const recipeUrl = `${cocktails}/${recipe.id}`;
  for (const init of [jsonRequest("DELETE"), jsonRequest("PATCH", { kind: "glass" })]) {
    const res = await app.request(toolUrl, init);
    expect(res.status).toBe(409);
    expect((await errorOf(res)).details).toEqual({
      used_by: [{ type: "cocktail", id: recipe.id, name: recipe.name }],
    });
    expect(await (await app.request(toolUrl)).json()).toEqual(tool);
    expect(await (await app.request(recipeUrl)).json()).toEqual(recipe);
  }
  expect((await app.request(recipeUrl, jsonRequest("DELETE"))).status).toBe(204);
  expect((await app.request(toolUrl, jsonRequest("DELETE"))).status).toBe(204);
});
