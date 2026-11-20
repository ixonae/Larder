import type { Page, Product } from "@larder/shared";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { barMembers, categories, favourites, products } from "../../db/schema/index.ts";
import { cookieFor, createTestApp, readJson as json, jsonRequest } from "../../test/app.ts";

const UNKNOWN = "01a1f326-d941-7d74-8a40-504a488cd388";

/** Alice owns her bar; Bob is a viewer in it and owns the second bar. */
function setup() {
  const t = createTestApp();
  t.db
    .insert(barMembers)
    .values({ bar_id: t.alice.barId, user_id: t.bob.userId, role: "viewer" })
    .run();
  const bobCookie = cookieFor(t.db, t.bob.userId);
  const bar = `/api/bars/${t.alice.barId}`;
  const cat = (barId = t.alice.barId) =>
    t.db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.bar_id, barId), eq(categories.name, "Gin")))
      .get()?.id as string;
  const send = (method: string, path: string, cookie?: string) =>
    t.app.request(`${bar}/${path}`, jsonRequest(method, undefined, cookie));
  const bottle = async (name: string) =>
    json<Product>(
      await t.app.request(`${bar}/products`, jsonRequest("POST", { name, category_id: cat() })),
    );
  const names = async (query = "", cookie?: string) =>
    (await json<Page<Product>>(await send("GET", `products?${query}`, cookie))).items.map(
      (p) => `${p.name}${p.is_favourite ? " ♥" : ""}`,
    );
  return { ...t, bobCookie, bar, cat, send, bottle, names };
}

describe("bottle favourites", () => {
  it("adds and removes a favourite idempotently, shown on the list and the detail", async () => {
    const t = setup();
    const gin = await t.bottle("Hendrick's");
    await t.bottle("Tanqueray");
    expect(gin.is_favourite).toBe(false);
    for (let i = 0; i < 2; i++) {
      expect((await t.send("PUT", `products/${gin.id}/favourite`)).status).toBe(204);
    }
    expect(t.db.select().from(favourites).all()).toHaveLength(1);
    expect((await json<Product>(await t.send("GET", `products/${gin.id}`))).is_favourite).toBe(
      true,
    );
    expect(await t.names()).toEqual(["Hendrick's ♥", "Tanqueray"]);
    expect(await t.names("favourite=true")).toEqual(["Hendrick's ♥"]);
    expect(await t.names("favourite=false")).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      expect((await t.send("DELETE", `products/${gin.id}/favourite`)).status).toBe(204);
    }
    expect(await t.names("favourite=true")).toEqual([]);
    expect((await t.send("PUT", `products/${UNKNOWN}/favourite`)).status).toBe(404);
    expect((await t.send("DELETE", "products/nope/favourite")).status).toBe(404);
  });

  it("are personal: a viewer may set them, and another member never sees them", async () => {
    const t = setup();
    const gin = await t.bottle("Hendrick's");
    expect((await t.send("PUT", `products/${gin.id}/favourite`, t.bobCookie)).status).toBe(204);
    expect(await t.names("", t.bobCookie)).toEqual(["Hendrick's ♥"]);
    expect(await t.names()).toEqual(["Hendrick's"]);
    expect(await t.names("favourite=true")).toEqual([]);
    // Alice's own favourite does not touch Bob's.
    await t.send("PUT", `products/${gin.id}/favourite`);
    await t.send("DELETE", `products/${gin.id}/favourite`);
    expect(await t.names("favourite=true", t.bobCookie)).toEqual(["Hendrick's ♥"]);
  });

  it("go with their bottle, in the same delete", async () => {
    const t = setup();
    const gin = await t.bottle("Hendrick's");
    await t.send("PUT", `products/${gin.id}/favourite`);
    await t.send("PUT", `products/${gin.id}/favourite`, t.bobCookie);
    expect((await t.send("DELETE", `products/${gin.id}`)).status).toBe(204);
    expect(t.db.select().from(favourites).all()).toEqual([]);
  });

  it("go with their cocktail", async () => {
    const t = setup();
    const res = await t.app.request(
      `${t.bar}/cocktails`,
      jsonRequest("POST", { name: "Negroni", method: "stirred" }),
    );
    const { id } = await json<{ id: string }>(res);
    await t.send("PUT", `cocktails/${id}/favourite`);
    expect(t.db.select().from(favourites).all()).toMatchObject([{ cocktail_id: id }]);
    expect((await t.send("DELETE", `cocktails/${id}`)).status).toBe(204);
    expect(t.db.select().from(favourites).all()).toEqual([]);
  });

  it("cannot reach another bar's bottles", async () => {
    const t = setup();
    const bobsGin = t.db
      .insert(products)
      .values({
        bar_id: t.bob.barId,
        created_by: t.bob.userId,
        name: "Bob's gin",
        category_id: t.cat(t.bob.barId),
      })
      .returning()
      .get();
    t.db
      .insert(favourites)
      .values({ bar_id: t.bob.barId, created_by: t.alice.userId, product_id: bobsGin.id })
      .run();
    for (const method of ["PUT", "DELETE"]) {
      expect((await t.send(method, `products/${bobsGin.id}/favourite`)).status).toBe(404);
    }
    // Alice's favourite in Bob's bar never shows in hers.
    expect(await t.names("favourite=true")).toEqual([]);
    expect(t.db.select().from(favourites).all()).toMatchObject([{ product_id: bobsGin.id }]);
    const bobs = await t.app.request(
      `/api/bars/${t.bob.barId}/products/${bobsGin.id}/favourite`,
      jsonRequest("PUT"),
    );
    expect(bobs.status).toBe(403);
  });
});
