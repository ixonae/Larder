import type { Page, Product, Tasting } from "@larder/shared";
import { newId } from "@larder/shared";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { barMembers, categories, products, tastings, users } from "../../db/schema/index.ts";
import {
  ALICE,
  cookieFor,
  createTestApp,
  errorOf,
  readJson as json,
  jsonRequest,
} from "../../test/app.ts";

const UNKNOWN = "01a1f326-d941-7d74-8a40-504a488cd388";

/** Alice owns her bar and Bob is an editor in it; Bob's own bar is the second tenant. */
function setup() {
  const t = createTestApp();
  t.db
    .insert(barMembers)
    .values({ bar_id: t.alice.barId, user_id: t.bob.userId, role: "editor" })
    .run();
  const bobCookie = cookieFor(t.db, t.bob.userId);
  const bar = `/api/bars/${t.alice.barId}`;
  const cat = (name: string, barId = t.alice.barId) =>
    t.db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.bar_id, barId), eq(categories.name, name)))
      .get()?.id as string;
  const send = (method: string, path: string, body?: unknown, cookie?: string) =>
    t.app.request(`${bar}/${path}`, jsonRequest(method, body, cookie));
  const bottle = async (name = "Talisker", category = "Scotch") =>
    json<Product>(await send("POST", "products", { name, category_id: cat(category) }));
  const taste = async (productId: string, body: object = {}, cookie?: string) => {
    const res = await send(
      "POST",
      `products/${productId}/tastings`,
      { tasted_on: "2026-11-01", ...body },
      cookie,
    );
    expect(res.status).toBe(201);
    return json<Tasting>(res);
  };
  const journal = async (query = "", cookie?: string) =>
    json<Page<Tasting>>(await send("GET", `tastings?${query}`, undefined, cookie));
  const product = async (id: string) => json<Product>(await send("GET", `products/${id}`));
  const rows = () => t.db.select().from(tastings).all();
  const setRole = (role: "viewer" | "editor") =>
    t.db
      .update(barMembers)
      .set({ role })
      .where(and(eq(barMembers.bar_id, t.alice.barId), eq(barMembers.user_id, t.bob.userId)))
      .run();
  return { ...t, bobCookie, bar, cat, send, bottle, taste, journal, product, rows, setRole };
}

describe("POST /products/:id/tastings", () => {
  it("records a tasting with its author and bottle", async () => {
    const t = setup();
    const talisker = await t.bottle();
    const tasting = await t.taste(talisker.id, {
      score: 4,
      notes: " Smoky ",
      location: " Home ",
    });
    expect(tasting).toMatchObject({
      product_id: talisker.id,
      tasted_on: "2026-11-01",
      score: 4,
      notes: "Smoky",
      location: "Home",
      is_private: false,
      author: { id: t.alice.userId, display_name: ALICE.display_name },
      product: {
        id: talisker.id,
        name: "Talisker",
        image_id: null,
        category_id: t.cat("Scotch"),
        category_name: "Scotch",
        status: null,
      },
    });
    expect(tasting.created_at).toBe(tasting.updated_at);
  });

  it("validates the day, the score and the text", async () => {
    const t = setup();
    const talisker = await t.bottle();
    for (const body of [
      {},
      { tasted_on: "2026-13-01" },
      { tasted_on: "2026-11-01", score: 0 },
      { tasted_on: "2026-11-01", score: 6 },
      { tasted_on: "2026-11-01", score: 3.5 },
      { tasted_on: "2026-11-01", location: "x".repeat(101) },
      { tasted_on: "2026-11-01", is_private: "true" },
    ]) {
      expect((await t.send("POST", `products/${talisker.id}/tastings`, body)).status).toBe(400);
    }
    expect(
      (await t.send("POST", `products/${UNKNOWN}/tastings`, { tasted_on: "2026-11-01" })).status,
    ).toBe(404);
    expect((await t.send("GET", `products/${UNKNOWN}/tastings`)).status).toBe(404);
    expect(t.rows()).toEqual([]);
  });
});

describe("tasting summary", () => {
  it("accepts a null-score tasting, counts it and leaves it out of the average", async () => {
    const t = setup();
    const talisker = await t.bottle();
    const other = await t.bottle("Lagavulin");
    expect((await t.product(talisker.id)).tasting_summary).toEqual({
      count: 0,
      avg_score: null,
      last_tasted_on: null,
    });
    const unscored = await t.taste(talisker.id, { tasted_on: "2026-11-05" });
    expect(unscored.score).toBeNull();
    expect((await t.product(talisker.id)).tasting_summary).toEqual({
      count: 1,
      avg_score: null,
      last_tasted_on: "2026-11-05",
    });
    await t.taste(talisker.id, { score: 4, tasted_on: "2026-10-01" });
    await t.taste(talisker.id, { score: 5 }, t.bobCookie);
    await t.taste(other.id, { score: 1 });
    expect((await t.product(talisker.id)).tasting_summary).toEqual({
      count: 3,
      avg_score: 4.5,
      last_tasted_on: "2026-11-05",
    });
    const list = await json<Page<Product>>(await t.send("GET", "products?q=a"));
    const summaries = Object.fromEntries(list.items.map((p) => [p.name, p.tasting_summary]));
    expect(summaries).toMatchObject({
      Talisker: { count: 3, avg_score: 4.5, last_tasted_on: "2026-11-05" },
      Lagavulin: { count: 1, avg_score: 1, last_tasted_on: "2026-11-01" },
    });
  });
});

describe("GET /tastings", () => {
  it("filters visibility before pagination and only counts tastings the caller can read", async () => {
    const t = setup();
    const { id } = await t.bottle();
    const shared = await t.taste(id, { score: 5 });
    const secret = await t.taste(id, { is_private: true, score: 1, tasted_on: "2026-11-02" });
    const bobs = await t.taste(
      id,
      { is_private: true, score: 3, tasted_on: "2026-11-03" },
      t.bobCookie,
    );

    expect(await t.journal(`product_id=${id}&limit=1`)).toMatchObject({
      items: [secret],
      next_cursor: expect.any(String),
    });
    expect((await t.journal("visibility=public")).items).toEqual([shared]);
    expect((await t.journal("visibility=private")).items).toEqual([secret]);
    expect((await t.journal("visibility=private&mine=true", t.bobCookie)).items).toEqual([bobs]);
    // `can_delete` is per caller: Bob cannot delete Alice's tasting.
    expect((await t.journal(`product_id=${id}`, t.bobCookie)).items).toEqual([
      bobs,
      { ...shared, can_delete: false },
    ]);
    expect((await t.send("GET", "tastings?visibility=all")).status).toBe(400);
    const bottlePath = `products/${id}/tastings`;
    const bobsPage = await json<Page<Tasting>>(
      await t.send("GET", `${bottlePath}?limit=1`, undefined, t.bobCookie),
    );
    expect(bobsPage.items).toEqual([bobs]);
    expect(
      await json<Page<Tasting>>(
        await t.send("GET", `${bottlePath}?cursor=${bobsPage.next_cursor}`, undefined, t.bobCookie),
      ),
    ).toEqual({ items: [{ ...shared, can_delete: false }], next_cursor: null });
    expect(
      (await json<Page<Tasting>>(await t.send("GET", `${bottlePath}?visibility=private`))).items,
    ).toEqual([secret]);
    expect((await t.send("GET", `${bottlePath}?visibility=all`)).status).toBe(400);

    const aliceSummary = { count: 2, avg_score: 3, last_tasted_on: "2026-11-02" };
    const bobSummary = { count: 2, avg_score: 4, last_tasted_on: "2026-11-03" };
    expect((await t.product(id)).tasting_summary).toEqual(aliceSummary);
    const detail = await json<Product>(
      await t.send("GET", `products/${id}`, undefined, t.bobCookie),
    );
    expect(detail.tasting_summary).toEqual(bobSummary);
    const list = await json<Page<Product>>(await t.send("GET", "products", undefined, t.bobCookie));
    expect(list.items.find((product) => product.id === id)?.tasting_summary).toEqual(bobSummary);
  });

  it("filters by category subtree, bottle, score, day and mine", async () => {
    const t = setup();
    const talisker = await t.bottle();
    const gin = await t.bottle("Tanqueray", "Gin");
    const a = await t.taste(talisker.id, { score: 5, tasted_on: "2026-01-10" });
    const b = await t.taste(talisker.id, { score: 2, tasted_on: "2026-03-10" }, t.bobCookie);
    const c = await t.taste(gin.id, { score: 3, tasted_on: "2026-02-10" });
    const d = await t.taste(gin.id, { tasted_on: "2026-04-10" });
    const ids = async (query: string, cookie?: string) =>
      (await t.journal(query, cookie)).items.map(({ id }) => id);
    expect(await ids("")).toEqual([d.id, b.id, c.id, a.id]);
    // Whisky is Scotch's parent: the filter includes sub-categories.
    expect(await ids(`category_id=${t.cat("Whisky")}`)).toEqual([b.id, a.id]);
    expect(await ids(`category_id=${t.cat("Spirit")}`)).toEqual([d.id, b.id, c.id, a.id]);
    expect(await ids(`product_id=${gin.id}`)).toEqual([d.id, c.id]);
    expect(await ids("score_min=3")).toEqual([c.id, a.id]);
    expect(await ids("score_max=3")).toEqual([b.id, c.id]);
    expect(await ids("score_min=2&score_max=3")).toEqual([b.id, c.id]);
    expect(await ids("from=2026-02-10&to=2026-03-10")).toEqual([b.id, c.id]);
    expect(await ids("mine=true")).toEqual([d.id, c.id, a.id]);
    expect(await ids("mine=true", t.bobCookie)).toEqual([b.id]);
    expect(await ids("mine=false", t.bobCookie)).toHaveLength(4);
    for (const query of ["score_min=0", "score_max=6", "from=yesterday", "mine=yes"]) {
      expect((await t.send("GET", `tastings?${query}`)).status).toBe(400);
    }
  });

  it("pages newest first, breaking ties on the same day by id", async () => {
    const t = setup();
    const talisker = await t.bottle();
    const made: Tasting[] = [];
    for (const tasted_on of [
      "2026-11-01",
      "2026-11-03",
      "2026-11-03",
      "2026-11-02",
      "2026-11-03",
    ]) {
      made.push(await t.taste(talisker.id, { tasted_on }));
    }
    const expected = [made[4], made[2], made[1], made[3], made[0]].map((m) => m?.id);
    const first = await t.journal("limit=2");
    expect(first.items.map(({ id }) => id)).toEqual(expected.slice(0, 2));
    const second = await t.journal(`limit=2&cursor=${first.next_cursor}`);
    expect(second.items.map(({ id }) => id)).toEqual(expected.slice(2, 4));
    const third = await t.journal(`limit=2&cursor=${second.next_cursor}`);
    expect(third).toEqual({
      items: [expect.objectContaining({ id: expected[4] })],
      next_cursor: null,
    });
    const gin = await t.bottle("Tanqueray", "Gin");
    expect(await json<Page<Tasting>>(await t.send("GET", `products/${gin.id}/tastings`))).toEqual({
      items: [],
      next_cursor: null,
    });
    await t.taste(gin.id, { tasted_on: "2026-11-04" });
    const path = `products/${talisker.id}/tastings`;
    const perBottle = await json<Page<Tasting>>(await t.send("GET", `${path}?limit=3`));
    expect(perBottle.items.map(({ id }) => id)).toEqual(expected.slice(0, 3));
    const rest = await json<Page<Tasting>>(
      await t.send("GET", `${path}?cursor=${perBottle.next_cursor}`),
    );
    expect(rest.items.map(({ id }) => id)).toEqual(expected.slice(3));
    expect((await t.send("GET", "tastings?cursor=bad")).status).toBe(400);
  });
});

describe("PATCH and DELETE /tastings/:id", () => {
  it("lets the author change visibility and hides a private tasting even from the bar owner", async () => {
    const t = setup();
    const { id } = await t.bottle();
    const tasting = await t.taste(id, { notes: "Peat" }, t.bobCookie);
    const path = `tastings/${tasting.id}`;
    const setPrivate = async (is_private: boolean) =>
      json<Tasting>(await t.send("PATCH", path, { is_private }, t.bobCookie));
    expect(await setPrivate(true)).toMatchObject({ notes: "Peat", is_private: true });
    expect(await t.journal()).toEqual({ items: [], next_cursor: null });
    expect((await t.send("PATCH", path, { is_private: false })).status).toBe(404);
    expect((await t.send("DELETE", path)).status).toBe(404);
    expect(await setPrivate(false)).toMatchObject({ notes: "Peat", is_private: false });
    expect((await t.journal()).items).toMatchObject([{ id: tasting.id }]);
  });

  it("lets only the author edit or delete a tasting", async () => {
    const t = setup();
    const talisker = await t.bottle();
    const mine = await t.taste(talisker.id, { score: 3, notes: "Peat" });
    const patched = await t.send("PATCH", `tastings/${mine.id}`, { score: null, notes: "" });
    expect(patched.status).toBe(200);
    expect(await json<Tasting>(patched)).toMatchObject({ score: null, notes: null });
    expect((await t.send("PATCH", `tastings/${mine.id}`, {})).status).toBe(400);
    // Bob is an editor in the bar, but not the author.
    const asBob = await t.send("PATCH", `tastings/${mine.id}`, { score: 1 }, t.bobCookie);
    expect(asBob.status).toBe(403);
    expect(await errorOf(asBob)).toMatchObject({ code: "FORBIDDEN" });
    expect((await t.send("DELETE", `tastings/${mine.id}`, undefined, t.bobCookie)).status).toBe(
      403,
    );
    expect(t.rows()).toMatchObject([{ id: mine.id, score: null }]);
    expect((await t.send("DELETE", `tastings/${mine.id}`)).status).toBe(204);
    expect(t.rows()).toEqual([]);
    for (const id of [mine.id, "nope"]) {
      expect((await t.send("PATCH", `tastings/${id}`, { score: 2 })).status).toBe(404);
      expect((await t.send("DELETE", `tastings/${id}`)).status).toBe(404);
    }
  });

  it("lets the owner delete tastings by someone who can no longer write, and no others", async () => {
    const t = setup();
    const talisker = await t.bottle();
    const mine = await t.taste(talisker.id);
    const bobs = await t.taste(talisker.id, {}, t.bobCookie);
    const flags = async (cookie?: string) =>
      Object.fromEntries((await t.journal("", cookie)).items.map((x) => [x.id, x.can_delete]));
    expect(await flags()).toEqual({ [mine.id]: true, [bobs.id]: false });
    expect(await flags(t.bobCookie)).toEqual({ [mine.id]: false, [bobs.id]: true });
    expect((await t.send("DELETE", `tastings/${bobs.id}`)).status).toBe(403);
    t.setRole("viewer");
    expect(await flags()).toEqual({ [mine.id]: true, [bobs.id]: true });
    expect(await flags(t.bobCookie)).toEqual({ [mine.id]: false, [bobs.id]: false });
    // The owner still cannot change what someone else wrote.
    expect((await t.send("PATCH", `tastings/${bobs.id}`, { score: 1 })).status).toBe(403);
    expect((await t.send("DELETE", `tastings/${bobs.id}`)).status).toBe(204);
    expect(t.rows()).toMatchObject([{ id: mine.id }]);
  });

  it("does not let a viewer record tastings, but lets them read the journal", async () => {
    const t = setup();
    const talisker = await t.bottle();
    const bobs = await t.taste(talisker.id, {}, t.bobCookie);
    t.setRole("viewer");
    const res = await t.send(
      "POST",
      `products/${talisker.id}/tastings`,
      { tasted_on: "2026-11-01" },
      t.bobCookie,
    );
    expect(res.status).toBe(403);
    expect((await t.send("PATCH", `tastings/${bobs.id}`, { score: 2 }, t.bobCookie)).status).toBe(
      403,
    );
    expect((await t.send("DELETE", `tastings/${bobs.id}`, undefined, t.bobCookie)).status).toBe(
      403,
    );
    expect((await t.journal("", t.bobCookie)).items).toHaveLength(1);
    expect(
      (await t.send("GET", `tastings?product_id=${talisker.id}`, undefined, t.bobCookie)).status,
    ).toBe(200);
    expect(t.rows()).toHaveLength(1);
  });
});

describe("deleting a bottle with tastings", () => {
  it("is refused, lists the tastings and deletes nothing", async () => {
    const t = setup();
    const talisker = await t.bottle();
    const tasting = await t.taste(talisker.id, { tasted_on: "2026-10-31" });
    const res = await t.send("DELETE", `products/${talisker.id}`);
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({
      code: "CONFLICT",
      message: `"Talisker" still has tastings`,
      details: { used_by: [{ type: "tasting", id: tasting.id, name: "Tasted on 2026-10-31" }] },
    });
    expect(t.db.select().from(products).where(eq(products.id, talisker.id)).get()).toBeTruthy();
    expect(t.rows()).toMatchObject([{ id: tasting.id }]);
  });

  it("refuses deleting a bottle with a private tasting without revealing its ID or date", async () => {
    const t = setup();
    const { id } = await t.bottle();
    const tasting = await t.taste(id, { is_private: true }, t.bobCookie);
    const res = await t.send("DELETE", `products/${id}`);
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({ code: "CONFLICT", message: '"Talisker" is still in use' });
    expect((await t.product(id)).tasting_summary).toEqual({
      count: 0,
      avg_score: null,
      last_tasted_on: null,
    });
    expect(t.rows()).toMatchObject([{ id: tasting.id }]);
  });

  it("lets the owner delete a bottle once only hidden tastings by former members are left", async () => {
    const t = setup();
    const { id } = await t.bottle();
    const shared = await t.taste(id, { tasted_on: "2026-10-30" }, t.bobCookie);
    await t.taste(id, { is_private: true }, t.bobCookie);
    t.db
      .delete(barMembers)
      .where(and(eq(barMembers.bar_id, t.alice.barId), eq(barMembers.user_id, t.bob.userId)))
      .run();
    // The public tasting is listed, so the owner can see and remove it first.
    const refused = await t.send("DELETE", `products/${id}`);
    expect(refused.status).toBe(409);
    expect((await errorOf(refused)).details).toEqual({
      used_by: [{ type: "tasting", id: shared.id, name: "Tasted on 2026-10-30" }],
    });
    expect(t.rows()).toHaveLength(2);
    expect((await t.send("DELETE", `tastings/${shared.id}`)).status).toBe(204);
    expect((await t.send("DELETE", `products/${id}`)).status).toBe(204);
    expect(t.rows()).toEqual([]);
  });

  it("keeps hidden tastings by former writers when an editor deletes the bottle", async () => {
    const t = setup();
    const { id } = await t.bottle();
    const carol = t.db
      .insert(users)
      .values({ id: newId(), email: "carol@x.y", display_name: "Carol" })
      .returning()
      .get();
    t.db
      .insert(barMembers)
      .values({ bar_id: t.alice.barId, user_id: carol.id, role: "editor" })
      .run();
    await t.taste(id, { is_private: true }, t.bobCookie);
    t.setRole("viewer");
    const res = await t.send("DELETE", `products/${id}`, undefined, cookieFor(t.db, carol.id));
    expect(res.status).toBe(409);
    expect(t.rows()).toHaveLength(1);
  });

  it("removes the tastings with the bar", async () => {
    const t = setup();
    await t.taste((await t.bottle()).id);
    const res = await t.app.request(t.bar, jsonRequest("DELETE", { name: "Alice's bar" }));
    expect(res.status).toBe(204);
    expect(t.rows()).toEqual([]);
  });
});

describe("cross-bar isolation", () => {
  it("cannot read or change another bar's tastings", async () => {
    const t = setup();
    const bobsBottle = t.db
      .insert(products)
      .values({
        bar_id: t.bob.barId,
        created_by: t.bob.userId,
        name: "Bob's Scotch",
        category_id: t.cat("Scotch", t.bob.barId),
      })
      .returning()
      .get();
    const bobsTasting = t.db
      .insert(tastings)
      .values({
        bar_id: t.bob.barId,
        created_by: t.alice.userId,
        product_id: bobsBottle.id,
        tasted_on: "2026-11-01",
        score: 5,
      })
      .returning()
      .get();
    for (const [method, path, body] of [
      ["GET", `products/${bobsBottle.id}/tastings`, undefined],
      ["POST", `products/${bobsBottle.id}/tastings`, { tasted_on: "2026-11-01" }],
      ["PATCH", `tastings/${bobsTasting.id}`, { score: 1 }],
      ["DELETE", `tastings/${bobsTasting.id}`, undefined],
    ] as const) {
      expect((await t.send(method, path, body)).status).toBe(404);
    }
    // Even as its author, Alice never sees the tasting from her own bar, nor its bottle's score.
    expect((await t.journal()).items).toEqual([]);
    expect((await t.journal(`product_id=${bobsBottle.id}`)).items).toEqual([]);
    const mine = await t.bottle();
    expect((await t.product(mine.id)).tasting_summary.count).toBe(0);
    expect(t.rows()).toMatchObject([{ id: bobsTasting.id, score: 5 }]);
    const bobs = await t.app.request(`/api/bars/${t.bob.barId}/tastings`);
    expect(bobs.status).toBe(403);
  });
});
