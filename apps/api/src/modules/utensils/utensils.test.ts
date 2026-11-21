import type { Page, Utensil } from "@larder/shared";
import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { barMembers, utensils } from "../../db/schema/index.ts";
import {
  createTestApp,
  errorOf,
  readJson as json,
  jsonRequest,
  type TestApp,
} from "../../test/app.ts";

const UNKNOWN = "01a1f326-d941-7d74-8a40-504a488cd388";

function setup(): TestApp & {
  bar: (barId: string) => string;
  send: (method: string, path: string, body?: unknown) => Response | Promise<Response>;
  create: (body: Record<string, unknown>) => Promise<Utensil>;
  names: (query: string) => Promise<string[]>;
  count: (barId?: string) => number;
} {
  const t = createTestApp();
  const bar = (barId: string): string => `/api/bars/${barId}`;
  const send = (method: string, path: string, body?: unknown): Response | Promise<Response> =>
    t.app.request(`${bar(t.alice.barId)}/utensils${path}`, jsonRequest(method, body));
  const create = async (body: Record<string, unknown>): Promise<Utensil> => {
    const res = await send("POST", "", body);
    expect(res.status).toBe(201);
    return json<Utensil>(res);
  };
  const names = async (query: string): Promise<string[]> =>
    (await json<Page<Utensil>>(await send("GET", query))).items.map((u) => u.name);
  const countRows = (barId: string = t.alice.barId): number =>
    t.db.select({ n: count() }).from(utensils).where(eq(utensils.bar_id, barId)).get()?.n ?? 0;
  return { ...t, bar, send, create, names, count: countRows };
}

async function stock(
  t: ReturnType<typeof setup>,
): Promise<{ coupe: Utensil; shaker: Utensil; rocks: Utensil; jigger: Utensil }> {
  const coupe = await t.create({ name: "Coupe", kind: "glass", capacity_ml: 180 });
  const shaker = await t.create({ name: "Boston shaker", kind: "tool" });
  const rocks = await t.create({ name: "Rocks", kind: "glass" });
  const jigger = await t.create({ name: "Jigger", kind: "tool", description: "30/45 ml" });
  return { coupe, shaker, rocks, jigger };
}

describe("POST /utensils", () => {
  it("creates a glass with its capacity", async () => {
    const t = setup();
    const res = await t.send("POST", "", {
      name: " Nick & Nora ",
      kind: "glass",
      capacity_ml: 150,
      description: " ",
    });
    expect(res.status).toBe(201);
    const created = await json<Utensil>(res);
    expect(created).toMatchObject({
      name: "Nick & Nora",
      kind: "glass",
      capacity_ml: 150,
      description: null,
    });
    const row = t.db.select().from(utensils).where(eq(utensils.id, created.id)).get();
    expect(row).toMatchObject({ bar_id: t.alice.barId, created_by: t.alice.userId });
  });

  it("refuses a capacity on a tool, on the capacity field", async () => {
    const t = setup();
    const res = await t.send("POST", "", { name: "Jigger", kind: "tool", capacity_ml: 30 });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({
      code: "VALIDATION",
      message: "Only glasses have a capacity",
      details: [{ path: ["capacity_ml"], message: "Only glasses have a capacity" }],
    });
    await t.create({ name: "Jigger", kind: "tool", capacity_ml: null });
  });

  it.each([
    ["a missing kind", { name: "X" }],
    ["an unknown kind", { name: "X", kind: "plate" }],
    ["a negative capacity", { name: "X", kind: "glass", capacity_ml: -1 }],
  ])("refuses %s", async (_, body) => {
    const t = setup();
    const res = await t.send("POST", "", body);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("VALIDATION");
    expect(t.count()).toBe(0);
  });

  it("refuses a viewer", async () => {
    const t = setup();
    t.db
      .insert(barMembers)
      .values({ bar_id: t.bob.barId, user_id: t.alice.userId, role: "viewer" })
      .run();
    const bobs = `${t.bar(t.bob.barId)}/utensils`;
    const body = { name: "X", kind: "tool" };
    expect((await t.app.request(bobs, jsonRequest("POST", body))).status).toBe(403);
    expect((await t.app.request(bobs)).status).toBe(200);
  });
});

describe("duplicate names", () => {
  it("refuses the same name ignoring case and accent form, across kinds", async () => {
    const t = setup();
    await t.create({ name: "Flûte", kind: "glass" });
    const nfd = "FLÛTE".normalize("NFD");
    const res = await t.send("POST", "", { name: nfd, kind: "tool" });
    expect(res.status).toBe(409);
    const message = `A utensil named "${nfd}" already exists`;
    expect(await errorOf(res)).toEqual({
      code: "CONFLICT",
      message,
      details: [{ path: ["name"], message }],
    });
    await t.create({ name: "Flute", kind: "glass" });
    expect(t.count()).toBe(2);
  });

  it("refuses a rename onto an existing name and changes nothing", async () => {
    const t = setup();
    const { rocks } = await stock(t);
    const res = await t.send("PATCH", `/${rocks.id}`, { name: "coupe", capacity_ml: 300 });
    expect(res.status).toBe(409);
    expect(await json(await t.send("GET", `/${rocks.id}`))).toEqual(rocks);
  });
});

describe("GET /utensils", () => {
  it("lists a page sorted by name, walking every page with the cursor", async () => {
    const t = setup();
    await stock(t);
    const first = await json<Page<Utensil>>(await t.send("GET", "?limit=3"));
    expect(first.items.map((u) => u.name)).toEqual(["Boston shaker", "Coupe", "Jigger"]);
    const second = await json<Page<Utensil>>(
      await t.send("GET", `?limit=3&cursor=${first.next_cursor}`),
    );
    expect(second).toEqual({
      items: [expect.objectContaining({ name: "Rocks" })],
      next_cursor: null,
    });
  });

  it("filters by kind and search", async () => {
    const t = setup();
    await stock(t);
    expect(await t.names("?kind=glass")).toEqual(["Coupe", "Rocks"]);
    expect(await t.names("?kind=tool&q=SHAK")).toEqual(["Boston shaker"]);
    expect(await t.names("?q=zzz")).toEqual([]);
  });

  it.each(["?cursor=nope", "?kind=plate", "?limit=0"])("refuses %s", async (query) => {
    const t = setup();
    const res = await t.send("GET", query);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("VALIDATION");
  });
});

describe("GET /utensils/:id", () => {
  it("returns one utensil", async () => {
    const t = setup();
    const { jigger } = await stock(t);
    expect(await json(await t.send("GET", `/${jigger.id}`))).toEqual(jigger);
  });

  it.each([UNKNOWN, "nope"])("answers 404 for %s", async (id) => {
    const t = setup();
    const res = await t.send("GET", `/${id}`);
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toEqual({ code: "NOT_FOUND", message: "Utensil not found" });
  });
});

describe("PATCH /utensils/:id", () => {
  it("changes only the fields sent and keeps the capacity", async () => {
    const t = setup();
    const { coupe } = await stock(t);
    const res = await t.send("PATCH", `/${coupe.id}`, { description: "Vintage" });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      name: "Coupe",
      capacity_ml: 180,
      description: "Vintage",
    });
    const cleared = await t.send("PATCH", `/${coupe.id}`, { capacity_ml: null });
    expect(await json(cleared)).toMatchObject({ capacity_ml: null });
  });

  it("drops the capacity when a glass becomes a tool, and refuses one on a tool", async () => {
    const t = setup();
    const { coupe, jigger } = await stock(t);
    const res = await t.send("PATCH", `/${coupe.id}`, { kind: "tool" });
    expect(await json(res)).toMatchObject({ kind: "tool", capacity_ml: null });
    const refused = await t.send("PATCH", `/${jigger.id}`, { capacity_ml: 30 });
    expect(refused.status).toBe(400);
    const glass = await t.send("PATCH", `/${jigger.id}`, { kind: "glass", capacity_ml: 60 });
    expect(await json(glass)).toMatchObject({ kind: "glass", capacity_ml: 60 });
  });

  it("refuses an empty patch and answers 404 for an unknown utensil", async () => {
    const t = setup();
    const { coupe } = await stock(t);
    expect((await t.send("PATCH", `/${coupe.id}`, {})).status).toBe(400);
    expect((await t.send("PATCH", `/${UNKNOWN}`, { name: "X" })).status).toBe(404);
  });
});

describe("DELETE /utensils/:id", () => {
  it("deletes a utensil", async () => {
    const t = setup();
    const { shaker } = await stock(t);
    expect((await t.send("DELETE", `/${shaker.id}`)).status).toBe(204);
    expect(t.count()).toBe(3);
    expect((await t.send("GET", `/${shaker.id}`)).status).toBe(404);
  });

  it("answers 404 for an unknown utensil", async () => {
    const t = setup();
    expect((await t.send("DELETE", `/${UNKNOWN}`)).status).toBe(404);
  });
});

describe("cross-bar isolation", () => {
  it("cannot read or change another bar's utensils", async () => {
    const t = setup();
    await stock(t);
    const bobsUrl = `${t.bar(t.bob.barId)}/utensils`;
    const bobs = t.db
      .insert(utensils)
      .values({ bar_id: t.bob.barId, created_by: t.bob.userId, name: "Coupe", kind: "glass" })
      .returning({ id: utensils.id })
      .get().id;
    // Through Alice's bar, Bob's utensil does not exist.
    expect((await t.send("GET", `/${bobs}`)).status).toBe(404);
    expect((await t.send("PATCH", `/${bobs}`, { name: "Mine" })).status).toBe(404);
    expect((await t.send("DELETE", `/${bobs}`)).status).toBe(404);
    // Through Bob's bar, Alice is not a member.
    expect((await t.app.request(bobsUrl)).status).toBe(403);
    expect((await t.app.request(`${bobsUrl}/${bobs}`, { method: "DELETE" })).status).toBe(403);
    // Lists only show Alice's own utensils.
    expect(await t.names("?q=coupe")).toEqual(["Coupe"]);
    expect(t.count(t.bob.barId)).toBe(1);
    const row = t.db.select().from(utensils).where(eq(utensils.id, bobs)).get();
    expect(row).toMatchObject({ name: "Coupe", kind: "glass" });
  });
});
