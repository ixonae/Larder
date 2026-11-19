import {
  type Cocktail,
  cocktailSchema,
  type Image,
  newId,
  type Page,
  type Utensil,
} from "@larder/shared";
import sharp from "sharp";
import { expect, test } from "vitest";
import { createTestApp, errorOf, jsonRequest, readJson } from "../../test/app.ts";

function setup() {
  const { app, db, alice, bob, storage } = createTestApp();
  const bar = `/api/bars/${alice.barId}`;
  const path = `${bar}/cocktails`;
  const create = (name: string, patch: object = {}) =>
    app.request(path, jsonRequest("POST", { name, method: "stirred", ...patch }));
  const read = async (name: string, patch?: object) => {
    const res = await create(name, patch);
    expect(res.status).toBe(201);
    return cocktailSchema.parse(await res.json());
  };
  return { app, db, alice, bob, storage, bar, path, create, read };
}

test("creates, filters, pages, edits and deletes cocktails with serving and variant notes", async () => {
  const { app, bar, path, create, read } = setup();
  const glass = await readJson<Utensil>(
    await app.request(
      `${bar}/utensils`,
      jsonRequest("POST", {
        name: "Coupe",
        kind: "glass",
      }),
    ),
  );
  const base = await read("Négroni", {
    ice: "large_cube",
    glass_id: glass.id,
    servings: 2,
    garnish: "Orange",
    serving_notes: "Or over ice",
    notes: "  ",
    description: "Bitter",
    source: "Recipe book",
  });
  expect(base).toMatchObject({
    glass_id: glass.id,
    servings: 2,
    ice: "large_cube",
    serving_notes: "Or over ice",
    notes: null,
    description: "Bitter",
    garnish: "Orange",
    source: "Recipe book",
  });
  const variant = await read("White Négroni", {
    variant_of_id: base.id,
    variant_note: "Use gentian",
  });
  expect(variant).toMatchObject({
    variant_of_id: base.id,
    variant_note: "Use gentian",
    ice: "none",
    servings: 1,
    glass_id: null,
    image_id: null,
  });
  expect((await create("NÉGRONI")).status).toBe(409);
  expect(
    (await app.request(`${path}/${variant.id}`, jsonRequest("PATCH", { name: "négroni" }))).status,
  ).toBe(409);
  const page = async (query: string) =>
    readJson<Page<Cocktail>>(await app.request(`${path}?${query}`));
  const first = await page("limit=1");
  expect(first.items).toEqual([base]);
  expect(await page(`limit=1&cursor=${first.next_cursor}`)).toEqual({
    items: [variant],
    next_cursor: null,
  });
  expect((await page(`q=NÉG&method=stirred&glass_id=${glass.id}`)).items).toEqual([base]);
  expect((await app.request(`${path}/${base.id}`, jsonRequest("PATCH", {}))).status).toBe(400);
  const updated = await app.request(
    `${path}/${variant.id}`,
    jsonRequest("PATCH", { ice: "cubes", variant_of_id: null }),
  );
  expect(await updated.json()).toMatchObject({
    name: variant.name,
    ice: "cubes",
    variant_of_id: null,
  });
  expect((await app.request(`${path}/${base.id}`, { method: "DELETE" })).status).toBe(204);
  expect((await app.request(`${path}/${base.id}`)).status).toBe(404);
});

test("deleting a referenced glass or base cocktail is refused and nothing is deleted", async () => {
  const { app, bar, path, create, read } = setup();
  const glass = await readJson<Utensil>(
    await app.request(`${bar}/utensils`, jsonRequest("POST", { name: "Rocks", kind: "glass" })),
  );
  const tool = await readJson<Utensil>(
    await app.request(`${bar}/utensils`, jsonRequest("POST", { name: "Spoon", kind: "tool" })),
  );
  expect((await create("Wrong glass", { glass_id: tool.id })).status).toBe(400);
  const base = await read("Old Fashioned", { glass_id: glass.id });
  const variant = await read("Maple Old Fashioned", { variant_of_id: base.id });
  const glassPath = `${bar}/utensils/${glass.id}`;
  for (const [url, init, dependent] of [
    [glassPath, jsonRequest("DELETE"), base],
    [glassPath, jsonRequest("PATCH", { kind: "tool" }), base],
    [`${path}/${base.id}`, jsonRequest("DELETE"), variant],
  ] as const) {
    const response = await app.request(url, init);
    expect(response.status).toBe(409);
    expect((await errorOf(response)).details).toEqual({
      used_by: [{ type: "cocktail", id: dependent.id, name: dependent.name }],
    });
  }
  const cycle = await app.request(
    `${path}/${base.id}`,
    jsonRequest("PATCH", { variant_of_id: variant.id }),
  );
  expect(cycle.status).toBe(400);
  expect(await (await app.request(glassPath)).json()).toEqual(glass);
  expect(await (await app.request(`${path}/${base.id}`)).json()).toEqual(base);
  expect(await (await app.request(`${path}/${variant.id}`)).json()).toEqual(variant);
});

test("another bar's cocktail and glass cannot be read, changed, or linked", async () => {
  const { app, bob, db, path, create, read } = setup();
  const glassId = newId();
  const foreignId = newId();
  const insert = db.$client;
  insert
    .prepare(
      "INSERT INTO utensils (id, bar_id, created_by, name, kind, created_at, updated_at) VALUES (?, ?, ?, 'Coupe', 'glass', '', '')",
    )
    .run(glassId, bob.barId, bob.userId);
  insert
    .prepare(
      "INSERT INTO cocktails (id, bar_id, created_by, name, method, created_at, updated_at) VALUES (?, ?, ?, 'Martini', 'stirred', '', '')",
    )
    .run(foreignId, bob.barId, bob.userId);
  const ours = await read("Martini");
  expect(await (await app.request(path)).json()).toEqual({ items: [ours], next_cursor: null });
  for (const method of ["GET", "PATCH", "DELETE"]) {
    const init = method === "PATCH" ? jsonRequest(method, { name: "Stolen" }) : { method };
    expect((await app.request(`${path}/${foreignId}`, init)).status).toBe(404);
  }
  expect((await app.request(`/api/bars/${bob.barId}/cocktails`)).status).toBe(403);
  expect((await create("Wrong bar", { glass_id: glassId })).status).toBe(400);
  expect((await create("Wrong base", { variant_of_id: foreignId })).status).toBe(400);
});

test("uploads, serves, removes and cleans up cocktail images", async () => {
  const { app, path, read } = setup();
  const cocktail = await read("Daiquiri");
  const url = `${path}/${cocktail.id}`;
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const upload = async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(png)], "red.png", { type: "image/png" }));
    const res = await app.request(`${url}/image`, { method: "PUT", body: form });
    expect(res.status).toBe(200);
    return (await readJson<Image>(res)).id;
  };
  const first = await upload();
  expect(await (await app.request(url)).json()).toMatchObject({ image_id: first });
  expect((await app.request(`/api/images/${first}/thumb`)).status).toBe(200);
  expect((await app.request(`${url}/image`, { method: "DELETE" })).status).toBe(204);
  expect((await app.request(`/api/images/${first}`)).status).toBe(404);
  const second = await upload();
  expect((await app.request(url, { method: "DELETE" })).status).toBe(204);
  expect((await app.request(`/api/images/${second}/thumb`)).status).toBe(404);
});
