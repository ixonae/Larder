import type { BottleComment, Page, Product } from "@larder/shared";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { barMembers, bottleComments, categories, products } from "../../db/schema/index.ts";
import {
  ALICE,
  cookieFor,
  createTestApp,
  errorOf,
  readJson as json,
  jsonRequest,
} from "../../test/app.ts";

const UNKNOWN = "01a1f326-d941-7d74-8a40-504a488cd388";
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

/** Alice owns her bar and Bob is an editor in it; Bob's own bar is the second tenant. */
function setup() {
  const t = createTestApp();
  t.db
    .insert(barMembers)
    .values({ bar_id: t.alice.barId, user_id: t.bob.userId, role: "editor" })
    .run();
  const bobCookie = cookieFor(t.db, t.bob.userId);
  const bar = `/api/bars/${t.alice.barId}`;
  const cat = (barId = t.alice.barId) =>
    t.db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.bar_id, barId), eq(categories.name, "Gin")))
      .get()?.id as string;
  const send = (method: string, path: string, body?: unknown, cookie?: string) =>
    t.app.request(`${bar}/${path}`, jsonRequest(method, body, cookie));
  const bottle = async (name = "Hendrick's") =>
    json<Product>(await send("POST", "products", { name, category_id: cat() }));
  const post = async (productId: string, body: string, cookie?: string) => {
    const res = await send("POST", `products/${productId}/comments`, { body }, cookie);
    expect(res.status).toBe(201);
    return json<BottleComment>(res);
  };
  const thread = async (productId: string, query = "", cookie?: string) =>
    json<Page<BottleComment>>(
      await send("GET", `products/${productId}/comments?${query}`, undefined, cookie),
    );
  const rows = () => t.db.select().from(bottleComments).all();
  const setRole = (role: "viewer" | "editor") =>
    t.db
      .update(barMembers)
      .set({ role })
      .where(and(eq(barMembers.bar_id, t.alice.barId), eq(barMembers.user_id, t.bob.userId)))
      .run();
  return { ...t, bobCookie, bar, cat, send, bottle, post, thread, rows, setRole };
}

describe("bottle comments", () => {
  it("posts a trimmed comment with its author and counts it on the bottle", async () => {
    const t = setup();
    const gin = await t.bottle();
    const comment = await t.post(gin.id, "  Great in a G&T  ");
    expect(comment).toMatchObject({
      product_id: gin.id,
      body: "Great in a G&T",
      is_private: false,
      author: { id: t.alice.userId, display_name: ALICE.display_name },
      edited: false,
    });
    await t.post(gin.id, "Agreed", t.bobCookie);
    const detail = await json<Product>(await t.send("GET", `products/${gin.id}`));
    expect(detail.comment_count).toBe(2);
    const list = await json<Page<Product>>(await t.send("GET", "products"));
    expect(list.items.find((p) => p.id === gin.id)?.comment_count).toBe(2);
  });

  it("refuses an empty or oversized body", async () => {
    const t = setup();
    const gin = await t.bottle();
    for (const body of ["", "   ", "x".repeat(2001), undefined]) {
      const res = await t.send("POST", `products/${gin.id}/comments`, { body });
      expect(res.status).toBe(400);
      expect(await errorOf(res)).toMatchObject({ code: "VALIDATION" });
    }
    const ok = await t.post(gin.id, "x".repeat(2000));
    expect(
      (await t.send("PATCH", `products/${gin.id}/comments/${ok.id}`, { body: " " })).status,
    ).toBe(400);
    expect(t.rows()).toHaveLength(1);
    expect((await t.send("POST", `products/${UNKNOWN}/comments`, { body: "Hi" })).status).toBe(404);
    expect((await t.send("GET", `products/${UNKNOWN}/comments`)).status).toBe(404);
  });

  it("lists the thread newest first, a page at a time", async () => {
    const t = setup();
    const gin = await t.bottle();
    const other = await t.bottle("Tanqueray");
    const made: BottleComment[] = [];
    for (const body of ["one", "two", "three"]) {
      made.push(await t.post(gin.id, body));
      await tick();
    }
    await t.post(other.id, "elsewhere");
    const first = await t.thread(gin.id, "limit=2");
    expect(first.items.map((c) => c.body)).toEqual(["three", "two"]);
    const second = await t.thread(gin.id, `limit=2&cursor=${first.next_cursor}`);
    expect(second).toEqual({ items: [made[0]], next_cursor: null });
  });

  it("filters private comments before pagination and omits them from other members' counts", async () => {
    const t = setup();
    const gin = await t.bottle();
    const path = `products/${gin.id}/comments`;
    const shared = await t.post(gin.id, "Shared");
    const response = await t.send(
      "POST",
      path,
      { body: "Just for me", is_private: true },
      t.bobCookie,
    );
    expect(response.status).toBe(201);
    const secret = await json<BottleComment>(response);
    expect(secret.is_private).toBe(true);
    expect(await t.thread(gin.id, "limit=1")).toEqual({ items: [shared], next_cursor: null });
    expect((await t.thread(gin.id, "visibility=private")).items).toEqual([]);
    expect((await t.thread(gin.id, "visibility=private", t.bobCookie)).items).toEqual([secret]);
    expect((await t.thread(gin.id, "visibility=public", t.bobCookie)).items).toEqual([shared]);
    expect((await t.send("GET", `${path}?visibility=all`)).status).toBe(400);

    const detail = await json<Product>(await t.send("GET", `products/${gin.id}`));
    expect(detail.comment_count).toBe(1);
    const list = await json<Page<Product>>(await t.send("GET", "products", undefined, t.bobCookie));
    expect(list.items.find((product) => product.id === gin.id)?.comment_count).toBe(2);

    const item = `${path}/${secret.id}`;
    expect((await t.send("PATCH", item, { body: "Guess" })).status).toBe(404);
    expect((await t.send("DELETE", item)).status).toBe(404);
    expect(await json(await t.send("PATCH", item, { is_private: true }, t.bobCookie))).toEqual(
      secret,
    );
    expect((await t.send("PATCH", item, {}, t.bobCookie)).status).toBe(400);
    await tick();
    const published = await json(await t.send("PATCH", item, { is_private: false }, t.bobCookie));
    expect(published).toMatchObject({ body: "Just for me", is_private: false, edited: true });
    expect((await t.thread(gin.id, "visibility=public")).items).toEqual([published, shared]);
  });

  it("lets only the author edit or delete a comment", async () => {
    const t = setup();
    const gin = await t.bottle();
    const mine = await t.post(gin.id, "Floral");
    const path = `products/${gin.id}/comments/${mine.id}`;
    // Saving the same text changes nothing.
    expect(await json<BottleComment>(await t.send("PATCH", path, { body: "Floral" }))).toEqual(
      mine,
    );
    await tick();
    const edited = await json<BottleComment>(await t.send("PATCH", path, { body: "Very floral" }));
    expect(edited).toMatchObject({ body: "Very floral", edited: true });
    for (const [method, body] of [
      ["PATCH", { body: "Mine now" }],
      ["DELETE", undefined],
    ] as const) {
      const res = await t.send(method, path, body, t.bobCookie);
      expect(res.status).toBe(403);
      expect(await errorOf(res)).toMatchObject({ code: "FORBIDDEN" });
    }
    expect(t.rows()).toMatchObject([{ body: "Very floral" }]);
    expect((await t.send("DELETE", path)).status).toBe(204);
    expect(t.rows()).toEqual([]);
    for (const commentId of [mine.id, "nope"]) {
      const missing = `products/${gin.id}/comments/${commentId}`;
      expect((await t.send("PATCH", missing, { body: "x" })).status).toBe(404);
      expect((await t.send("DELETE", missing)).status).toBe(404);
    }
    // A comment is only reachable through its own bottle.
    const other = await t.bottle("Tanqueray");
    const theirs = await t.post(gin.id, "Here");
    expect((await t.send("DELETE", `products/${other.id}/comments/${theirs.id}`)).status).toBe(404);
  });

  it("does not let a viewer post, edit or delete, but lets them read", async () => {
    const t = setup();
    const gin = await t.bottle();
    const bobs = await t.post(gin.id, "Mine", t.bobCookie);
    t.setRole("viewer");
    const path = `products/${gin.id}/comments`;
    expect((await t.send("POST", path, { body: "Hi" }, t.bobCookie)).status).toBe(403);
    expect((await t.send("PATCH", `${path}/${bobs.id}`, { body: "x" }, t.bobCookie)).status).toBe(
      403,
    );
    expect((await t.send("DELETE", `${path}/${bobs.id}`, undefined, t.bobCookie)).status).toBe(403);
    expect((await t.thread(gin.id, "", t.bobCookie)).items).toHaveLength(1);
  });

  it("are removed with their bottle", async () => {
    const t = setup();
    const gin = await t.bottle();
    await t.post(gin.id, "Bye");
    await t.post(gin.id, "Soon gone", t.bobCookie);
    expect((await t.send("DELETE", `products/${gin.id}`)).status).toBe(204);
    expect(t.rows()).toEqual([]);
    expect(t.db.select().from(products).where(eq(products.id, gin.id)).get()).toBeUndefined();
  });

  it("cannot read or change another bar's comments", async () => {
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
    const bobsComment = t.db
      .insert(bottleComments)
      .values({
        bar_id: t.bob.barId,
        created_by: t.alice.userId,
        product_id: bobsGin.id,
        body: "Hidden",
      })
      .returning()
      .get();
    const path = `products/${bobsGin.id}/comments`;
    for (const [method, sub, body] of [
      ["GET", "", undefined],
      ["POST", "", { body: "Hi" }],
      ["PATCH", `/${bobsComment.id}`, { body: "x" }],
      ["DELETE", `/${bobsComment.id}`, undefined],
    ] as const) {
      expect((await t.send(method, `${path}${sub}`, body)).status).toBe(404);
    }
    const mine = await t.bottle();
    expect((await t.send("DELETE", `products/${mine.id}/comments/${bobsComment.id}`)).status).toBe(
      404,
    );
    expect(t.rows()).toMatchObject([{ id: bobsComment.id, body: "Hidden" }]);
    expect((await t.app.request(`/api/bars/${t.bob.barId}/${path}`)).status).toBe(403);
  });
});
