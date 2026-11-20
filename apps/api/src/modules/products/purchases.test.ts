import type { CocktailDetail, Product, Purchase, PurchaseList } from "@larder/shared";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { barMembers, bars, categories, productPurchases, products } from "../../db/schema/index.ts";
import { createTestApp, errorOf, readJson as json, jsonRequest } from "../../test/app.ts";

const UNKNOWN = "01a1f326-d941-7d74-8a40-504a488cd388";

function setup() {
  const t = createTestApp();
  const bar = `/api/bars/${t.alice.barId}`;
  const cat = (name: string, barId = t.alice.barId) =>
    t.db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.bar_id, barId), eq(categories.name, name)))
      .get()?.id as string;
  const send = (method: string, path: string, body?: unknown) =>
    t.app.request(`${bar}/${path}`, jsonRequest(method, body));
  const bottle = async (status = "tasted", name = "Hendrick's") =>
    json<Product>(await send("POST", "products", { name, category_id: cat("Gin"), status }));
  const product = async (id: string) => json<Product>(await send("GET", `products/${id}`));
  const buy = async (id: string, body: object = {}) => {
    const res = await send("POST", `products/${id}/purchases`, {
      bought_on: "2026-11-01",
      ...body,
    });
    expect(res.status).toBe(201);
    return (await json<PurchaseList>(res)).items;
  };
  const finish = (id: string, body: object = {}) => send("POST", `products/${id}/finish`, body);
  const history = async (id: string) =>
    (await json<PurchaseList>(await send("GET", `products/${id}/purchases`))).items;
  const patch = (id: string, purchaseId: string, body: object) =>
    send("PATCH", `products/${id}/purchases/${purchaseId}`, body);
  const rows = () => t.db.select().from(productPurchases).all();
  return { ...t, bar, cat, send, bottle, product, buy, finish, history, patch, rows };
}

describe("POST /products/:id/purchases", () => {
  it("records one bottle without a price and puts the bottle in the bar", async () => {
    const t = setup();
    const gin = await t.bottle("want_to_buy");
    const [purchase, ...rest] = await t.buy(gin.id, { store: " Shop ", currency: "USD" });
    expect(rest).toEqual([]);
    expect(purchase).toMatchObject({
      product_id: gin.id,
      bought_on: "2026-11-01",
      price_minor: null,
      currency: null,
      store: "Shop",
      notes: null,
      finished_on: null,
    });
    expect(await t.product(gin.id)).toMatchObject({
      status: "owned",
      stock: {
        open_count: 1,
        total_count: 1,
        last_bought_on: "2026-11-01",
        last_finished_on: null,
      },
    });
  });

  it("defaults the currency of a price to the bar's currency", async () => {
    const t = setup();
    const gin = await t.bottle();
    expect(await t.buy(gin.id, { price_minor: 4500 })).toMatchObject([
      { price_minor: 4500, currency: "JPY" },
    ]);
    t.db.update(bars).set({ currency: "EUR" }).where(eq(bars.id, t.alice.barId)).run();
    expect(await t.buy(gin.id, { price_minor: 1999 })).toMatchObject([{ currency: "EUR" }]);
    expect(await t.buy(gin.id, { price_minor: 2500, currency: "USD" })).toMatchObject([
      { currency: "USD" },
    ]);
  });

  it("creates count identical rows atomically, and an invalid request creates none", async () => {
    const t = setup();
    const gin = await t.bottle();
    const bought = await t.buy(gin.id, { count: 3, price_minor: 3000, notes: "Sale" });
    expect(bought).toHaveLength(3);
    expect(new Set(bought.map(({ id }) => id)).size).toBe(3);
    expect(bought.every((p) => p.price_minor === 3000 && p.notes === "Sale")).toBe(true);
    for (const body of [
      { bought_on: "2026-11-02", count: 25 },
      { bought_on: "2026-11-02", count: 3, price_minor: -1 },
    ]) {
      expect((await t.send("POST", `products/${gin.id}/purchases`, body)).status).toBe(400);
    }
    expect(t.rows()).toHaveLength(3);
    expect((await t.product(gin.id)).stock.total_count).toBe(3);
  });

  it("answers 404 for an unknown bottle", async () => {
    const t = setup();
    const body = { bought_on: "2026-11-01" };
    expect((await t.send("POST", `products/${UNKNOWN}/purchases`, body)).status).toBe(404);
    expect((await t.send("GET", `products/${UNKNOWN}/purchases`)).status).toBe(404);
  });
});

describe("GET /products/:id/purchases", () => {
  it("lists the bottle's purchases newest first", async () => {
    const t = setup();
    const gin = await t.bottle();
    const other = await t.bottle("owned", "Tanqueray");
    await t.buy(gin.id, { bought_on: "2026-01-01" });
    await t.buy(gin.id, { bought_on: "2026-06-01" });
    await t.buy(other.id);
    expect((await t.history(gin.id)).map(({ bought_on }) => bought_on)).toEqual([
      "2026-06-01",
      "2026-01-01",
    ]);
  });
});

describe("POST /products/:id/finish", () => {
  it("buy 2 then finish 1 keeps the bottle owned, closing the oldest open purchase", async () => {
    const t = setup();
    const gin = await t.bottle();
    const [old] = await t.buy(gin.id, { bought_on: "2026-01-01" });
    await t.buy(gin.id, { bought_on: "2026-03-01" });
    const res = await t.finish(gin.id, { finished_on: "2026-11-10" });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      status: "owned",
      stock: { open_count: 1, total_count: 2, last_finished_on: "2026-11-10" },
    });
    const closed = (await t.history(gin.id)).find(({ finished_on }) => finished_on !== null);
    expect(closed?.id).toBe(old?.id);
  });

  it("finishing the last open bottle finishes it, and a cocktail needing it stops being makeable", async () => {
    const t = setup();
    const gin = await t.bottle();
    await t.buy(gin.id);
    const drink = await json<CocktailDetail>(
      await t.send("POST", "cocktails", {
        name: "Gin Neat",
        method: "built",
        ingredients: [{ product_id: gin.id, amount: 50, unit: "ml" }],
      }),
    );
    expect(drink.missing).toEqual([]);
    vi.useFakeTimers({ now: new Date("2026-11-20T09:00:00Z"), toFake: ["Date"] });
    try {
      expect(await json(await t.finish(gin.id))).toMatchObject({
        status: "finished",
        stock: { open_count: 0, total_count: 1, last_finished_on: "2026-11-20" },
      });
    } finally {
      vi.useRealTimers();
    }
    const after = await json<CocktailDetail>(await t.send("GET", `cocktails/${drink.id}`));
    expect(after.missing.map(({ name }) => name)).toEqual(["Hendrick's"]);
  });

  it("finishes a bottle owned without any purchase record", async () => {
    const t = setup();
    const gin = await t.bottle("owned");
    expect(await json(await t.finish(gin.id))).toMatchObject({
      status: "finished",
      stock: { open_count: 0, total_count: 0 },
    });
    expect(t.rows()).toEqual([]);
  });

  it("refuses a finish before the purchase date and changes nothing", async () => {
    const t = setup();
    const gin = await t.bottle();
    await t.buy(gin.id, { bought_on: "2026-11-01" });
    const res = await t.finish(gin.id, { finished_on: "2026-10-31" });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).details).toEqual([
      { path: ["finished_on"], message: "A bottle cannot run out before the day it was bought" },
    ]);
    expect(await t.product(gin.id)).toMatchObject({ status: "owned", stock: { open_count: 1 } });
    expect((await t.finish(UNKNOWN)).status).toBe(404);
  });
});

describe("PATCH /products/:id/purchases/:purchaseId", () => {
  it("reopening a finished purchase puts the bottle back in the bar", async () => {
    const t = setup();
    const gin = await t.bottle();
    const [purchase] = (await t.buy(gin.id)) as [Purchase];
    await t.finish(gin.id, { finished_on: "2026-11-05" });
    expect((await t.product(gin.id)).status).toBe("finished");
    const res = await t.patch(gin.id, purchase.id, { finished_on: null });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ id: purchase.id, finished_on: null });
    expect(await t.product(gin.id)).toMatchObject({ status: "owned", stock: { open_count: 1 } });
  });

  it("finishes the bottle when the last open purchase gets a finish date, keeps it otherwise", async () => {
    const t = setup();
    const gin = await t.bottle();
    const [first, second] = (await t.buy(gin.id, { count: 2 })) as [Purchase, Purchase];
    await t.patch(gin.id, first.id, { finished_on: "2026-11-02" });
    expect((await t.product(gin.id)).status).toBe("owned");
    await t.patch(gin.id, second.id, { finished_on: "2026-11-03" });
    expect((await t.product(gin.id)).status).toBe("finished");
    // Moving a finish date or editing other fields leaves the status alone.
    await t.send("PATCH", `products/${gin.id}/status`, { status: "tasted" });
    await t.patch(gin.id, second.id, { finished_on: "2026-11-04", store: "Corner shop" });
    expect((await t.product(gin.id)).status).toBe("tasted");
  });

  it("keeps the price and currency together", async () => {
    const t = setup();
    const gin = await t.bottle();
    const [purchase] = (await t.buy(gin.id)) as [Purchase];
    const edit = async (body: object) => json<Purchase>(await t.patch(gin.id, purchase.id, body));
    expect(await edit({ notes: "Gift" })).toMatchObject({ price_minor: null, currency: null });
    expect(await edit({ price_minor: 1000 })).toMatchObject({ price_minor: 1000, currency: "JPY" });
    expect(await edit({ currency: "USD" })).toMatchObject({ price_minor: 1000, currency: "USD" });
    expect(await edit({ price_minor: 1250 })).toMatchObject({ price_minor: 1250, currency: "USD" });
    expect(await edit({ price_minor: null })).toMatchObject({ price_minor: null, currency: null });
    expect(await edit({ currency: "EUR" })).toMatchObject({ price_minor: null, currency: null });
  });

  it("refuses a finish date before the purchase date, also when moving the purchase date", async () => {
    const t = setup();
    const gin = await t.bottle();
    const [purchase] = (await t.buy(gin.id)) as [Purchase];
    expect((await t.patch(gin.id, purchase.id, { finished_on: "2026-10-01" })).status).toBe(400);
    await t.patch(gin.id, purchase.id, { finished_on: "2026-11-05" });
    expect((await t.patch(gin.id, purchase.id, { bought_on: "2026-11-06" })).status).toBe(400);
    expect(await t.history(gin.id)).toMatchObject([
      { bought_on: "2026-11-01", finished_on: "2026-11-05" },
    ]);
  });

  it("answers 400 for an empty patch and 404 for an unknown purchase or another bottle's", async () => {
    const t = setup();
    const gin = await t.bottle();
    const other = await t.bottle("owned", "Tanqueray");
    const [purchase] = (await t.buy(gin.id)) as [Purchase];
    expect((await t.patch(gin.id, purchase.id, {})).status).toBe(400);
    expect((await t.patch(gin.id, UNKNOWN, { notes: "x" })).status).toBe(404);
    expect((await t.patch(other.id, purchase.id, { notes: "x" })).status).toBe(404);
  });
});

describe("DELETE /products/:id/purchases/:purchaseId", () => {
  it("deleting the last open purchase finishes a bottle that has finished purchases", async () => {
    const t = setup();
    const gin = await t.bottle();
    await t.buy(gin.id, { bought_on: "2026-01-01" });
    const [open] = (await t.buy(gin.id, { bought_on: "2026-02-01" })) as [Purchase];
    await t.finish(gin.id, { finished_on: "2026-03-01" });
    expect((await t.send("DELETE", `products/${gin.id}/purchases/${open.id}`)).status).toBe(204);
    expect(await t.product(gin.id)).toMatchObject({
      status: "finished",
      stock: { open_count: 0, total_count: 1 },
    });
  });

  it("deleting the only purchase, an open one among others or a finished one keeps the status", async () => {
    const t = setup();
    const gin = await t.bottle();
    const [only] = (await t.buy(gin.id)) as [Purchase];
    await t.send("DELETE", `products/${gin.id}/purchases/${only.id}`);
    expect(await t.product(gin.id)).toMatchObject({ status: "owned", stock: { total_count: 0 } });

    const [a, b] = (await t.buy(gin.id, { count: 2 })) as [Purchase, Purchase];
    await t.send("DELETE", `products/${gin.id}/purchases/${a.id}`);
    expect((await t.product(gin.id)).status).toBe("owned");

    await t.finish(gin.id, { finished_on: "2026-11-02" });
    await t.send("PATCH", `products/${gin.id}/status`, { status: "want_to_try" });
    await t.send("DELETE", `products/${gin.id}/purchases/${b.id}`);
    expect((await t.product(gin.id)).status).toBe("want_to_try");
  });

  it("answers 404 for an unknown purchase", async () => {
    const t = setup();
    const gin = await t.bottle();
    expect((await t.send("DELETE", `products/${gin.id}/purchases/${UNKNOWN}`)).status).toBe(404);
    expect((await t.send("DELETE", `products/${gin.id}/purchases/nope`)).status).toBe(404);
  });
});

describe("PATCH /products/:id/status", () => {
  it("setting owned creates no purchase, and other statuses leave purchases untouched", async () => {
    const t = setup();
    const gin = await t.bottle("want_to_buy");
    await t.send("PATCH", `products/${gin.id}/status`, { status: "owned" });
    expect(t.rows()).toEqual([]);
    await t.buy(gin.id);
    const before = t.rows();
    const res = await t.send("PATCH", `products/${gin.id}/status`, { status: "tasted" });
    expect(await json(res)).toMatchObject({ status: "tasted", stock: { open_count: 1 } });
    expect(t.rows()).toEqual(before);
  });
});

describe("deleting a bottle with purchases", () => {
  it("is refused, lists the purchases and deletes nothing", async () => {
    const t = setup();
    const gin = await t.bottle();
    const [purchase] = (await t.buy(gin.id)) as [Purchase];
    const res = await t.send("DELETE", `products/${gin.id}`);
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({
      code: "CONFLICT",
      message: `"Hendrick's" still has purchases`,
      details: { used_by: [{ type: "purchase", id: purchase.id, name: "Bought on 2026-11-01" }] },
    });
    expect(t.db.select().from(products).where(eq(products.id, gin.id)).get()).toBeTruthy();
    expect(t.rows()).toHaveLength(1);
  });
});

describe("permissions and isolation", () => {
  it("lets viewers read purchases but not write them or change the status", async () => {
    const t = setup();
    const gin = await t.bottle();
    const [purchase] = (await t.buy(gin.id)) as [Purchase];
    t.db
      .update(barMembers)
      .set({ role: "viewer" })
      .where(and(eq(barMembers.bar_id, t.alice.barId), eq(barMembers.user_id, t.alice.userId)))
      .run();
    const path = `products/${gin.id}`;
    expect((await t.send("GET", `${path}/purchases`)).status).toBe(200);
    for (const [method, sub, body] of [
      ["POST", "/purchases", { bought_on: "2026-11-01" }],
      ["PATCH", `/purchases/${purchase.id}`, { notes: "x" }],
      ["DELETE", `/purchases/${purchase.id}`, undefined],
      ["POST", "/finish", {}],
      ["PATCH", "/status", { status: "tasted" }],
    ] as const) {
      expect((await t.send(method, `${path}${sub}`, body)).status).toBe(403);
    }
    expect(t.rows()).toMatchObject([{ finished_on: null, notes: null }]);
  });

  it("cannot read or change another bar's purchases or status", async () => {
    const t = setup();
    const bobsBottle = t.db
      .insert(products)
      .values({
        bar_id: t.bob.barId,
        created_by: t.bob.userId,
        name: "Bob's gin",
        category_id: t.cat("Gin", t.bob.barId),
        status: "owned",
      })
      .returning()
      .get();
    const bobsPurchase = t.db
      .insert(productPurchases)
      .values({
        bar_id: t.bob.barId,
        created_by: t.bob.userId,
        product_id: bobsBottle.id,
        bought_on: "2026-11-01",
      })
      .returning()
      .get();
    const path = `products/${bobsBottle.id}`;
    for (const [method, sub, body] of [
      ["GET", "/purchases", undefined],
      ["POST", "/purchases", { bought_on: "2026-11-01" }],
      ["PATCH", `/purchases/${bobsPurchase.id}`, { notes: "x" }],
      ["DELETE", `/purchases/${bobsPurchase.id}`, undefined],
      ["POST", "/finish", {}],
      ["PATCH", "/status", { status: "tasted" }],
    ] as const) {
      expect((await t.send(method, `${path}${sub}`, body)).status).toBe(404);
    }
    // Alice's own bottle cannot reach Bob's purchase either.
    const gin = await t.bottle();
    expect((await t.patch(gin.id, bobsPurchase.id, { notes: "x" })).status).toBe(404);
    // Bob's purchase never counts in Alice's stock, nor his bottle in her list.
    expect((await t.product(gin.id)).stock.total_count).toBe(0);
    expect(t.rows()).toMatchObject([{ id: bobsPurchase.id, notes: null, finished_on: null }]);
    expect(t.db.select().from(products).where(eq(products.id, bobsBottle.id)).get()).toMatchObject({
      status: "owned",
    });
    const bobsUrl = `/api/bars/${t.bob.barId}/products/${bobsBottle.id}/purchases`;
    expect((await t.app.request(bobsUrl)).status).toBe(403);
  });
});

describe("deleting a bar with purchases", () => {
  it("removes its bottles and purchases together", async () => {
    const t = setup();
    const gin = await t.bottle();
    await t.buy(gin.id, { count: 2 });
    const res = await t.app.request(t.bar, jsonRequest("DELETE", { name: "Alice's bar" }));
    expect(res.status).toBe(204);
    expect(t.rows()).toEqual([]);
    expect(t.db.select().from(products).where(eq(products.id, gin.id)).get()).toBeUndefined();
  });
});
