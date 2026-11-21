import type { Cocktail, CocktailDetail, Comment, Page, Rating, RatingInput } from "@larder/shared";
import { expect, test } from "vitest";
import { barMembers } from "../../db/schema/index.ts";
import {
  ALICE,
  cookieFor,
  createTestApp,
  errorOf,
  jsonRequest,
  readJson,
  type TestApp,
} from "../../test/app.ts";

/** A well-formed id that no cocktail has. */
const missingId: string = "01890000-0000-7000-8000-000000000000";

/** Lets the clock move on so `updated_at` values differ. */
const tick = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 5));

/** Alice owns the bar; Bob is a viewer in it and Bob's own bar is a second tenant. */
function setup(): TestApp & {
  bobCookie: string;
  path: string;
  create: (name: string, patch?: object) => Promise<CocktailDetail>;
  send: (url: string, method: string, body?: unknown, cookie?: string) => Promise<Response>;
  rate: (id: string, input: RatingInput, cookie?: string) => Promise<Response>;
  detail: (id: string, cookie?: string) => Promise<CocktailDetail>;
  list: (query?: string, cookie?: string) => Promise<Page<Cocktail>>;
  comment: (id: string, body: object, cookie?: string) => Promise<Response>;
  comments: (id: string, query?: string, cookie?: string) => Promise<Page<Comment>>;
} {
  const t = createTestApp();
  t.db
    .insert(barMembers)
    .values({ bar_id: t.alice.barId, user_id: t.bob.userId, role: "viewer" })
    .run();
  const bobCookie: string = cookieFor(t.db, t.bob.userId);
  const path: string = `/api/bars/${t.alice.barId}/cocktails`;
  const create = async (name: string, patch: object = {}): Promise<CocktailDetail> => {
    const res: Response = await t.app.request(
      path,
      jsonRequest("POST", { name, method: "stirred", ...patch }),
    );
    expect(res.status).toBe(201);
    return readJson<CocktailDetail>(res);
  };
  const send = async (
    url: string,
    method: string,
    body?: unknown,
    cookie?: string,
  ): Promise<Response> => t.app.request(url, jsonRequest(method, body, cookie));
  const rate = (id: string, input: RatingInput, cookie?: string): Promise<Response> =>
    send(`${path}/${id}/rating`, "PUT", input, cookie);
  const detail = async (id: string, cookie?: string): Promise<CocktailDetail> =>
    readJson<CocktailDetail>(await send(`${path}/${id}`, "GET", undefined, cookie));
  const list = async (query: string = "", cookie?: string): Promise<Page<Cocktail>> =>
    readJson<Page<Cocktail>>(await send(`${path}?${query}`, "GET", undefined, cookie));
  const comment = (id: string, body: object, cookie?: string): Promise<Response> =>
    send(`${path}/${id}/comments`, "POST", body, cookie);
  const comments = async (
    id: string,
    query: string = "",
    cookie?: string,
  ): Promise<Page<Comment>> =>
    readJson<Page<Comment>>(
      await send(`${path}/${id}/comments?${query}`, "GET", undefined, cookie),
    );
  return { ...t, bobCookie, path, create, send, rate, detail, list, comment, comments };
}

test("upserts a rating, validates the score and deletes it", async () => {
  const t = setup();
  const { id } = await t.create("Negroni");
  expect((await t.detail(id)).my_rating).toBeNull();
  for (const score of [0, 6, 2.5]) {
    expect((await t.rate(id, { score })).status).toBe(400);
  }
  const first: Rating = await readJson<Rating>(await t.rate(id, { score: 3 }));
  expect(first).toMatchObject({ score: 3 });
  await tick();
  const second: Rating = await readJson<Rating>(await t.rate(id, { score: 5 }));
  expect(second).toMatchObject({ score: 5 });
  expect(second.updated_at > first.updated_at).toBe(true);
  await t.rate(id, { score: 4 });
  const own: CocktailDetail = await t.detail(id);
  expect(own).toMatchObject({ rating_count: 1, avg_rating: 4, other_ratings: [] });
  expect(own.my_rating).toMatchObject({ score: 4 });
  expect((await t.send(`${t.path}/${id}/rating`, "DELETE")).status).toBe(204);
  expect((await t.send(`${t.path}/${id}/rating`, "DELETE")).status).toBe(204);
  expect(await t.detail(id)).toMatchObject({ my_rating: null, avg_rating: null, rating_count: 0 });
  expect((await t.rate(missingId, { score: 3 })).status).toBe(404);
  expect((await t.send(`${t.path}/nope/rating`, "DELETE")).status).toBe(404);
});

test("everyone in the bar sees who rated what, and all ratings count in the average", async () => {
  const t = setup();
  const { id } = await t.create("Daiquiri");
  await t.rate(id, { score: 5 });
  await t.rate(id, { score: 2 }, t.bobCookie);
  const asBob: CocktailDetail = await t.detail(id, t.bobCookie);
  expect(asBob).toMatchObject({ avg_rating: 3.5, rating_count: 2 });
  expect(asBob.my_rating).toMatchObject({ score: 2 });
  expect(asBob.other_ratings).toEqual([
    {
      user: { id: t.alice.userId, display_name: ALICE.display_name },
      score: 5,
      updated_at: expect.any(String),
    },
  ]);
  const asAlice: CocktailDetail = await t.detail(id);
  expect(asAlice.my_rating).toMatchObject({ score: 5 });
  expect(asAlice.other_ratings).toEqual([
    { user: { id: t.bob.userId, display_name: "Bob" }, score: 2, updated_at: expect.any(String) },
  ]);
});

test("variants keep their own ratings, comments and favourites", async () => {
  const t = setup();
  const parent: CocktailDetail = await t.create("Negroni");
  const variant: CocktailDetail = await t.create("White Negroni", { variant_of_id: parent.id });
  await t.rate(parent.id, { score: 5 });
  await t.comment(parent.id, { body: "Classic" });
  await t.send(`${t.path}/${parent.id}/favourite`, "PUT");
  expect(await t.detail(variant.id)).toMatchObject({
    rating_count: 0,
    avg_rating: null,
    is_favourite: false,
  });
  expect((await t.comments(variant.id)).items).toEqual([]);
});

test("ratings, comments and favourites stay inside their bar", async () => {
  const t = setup();
  const { id } = await t.create("Negroni");
  await t.rate(id, { score: 4 });
  const comment: Comment = await readJson<Comment>(await t.comment(id, { body: "Nice" }));
  const other = `/api/bars/${t.bob.barId}/cocktails/${id}`;
  for (const [suffix, method, body] of [
    ["/rating", "PUT", { score: 3 }],
    ["/rating", "DELETE", undefined],
    ["/favourite", "PUT", undefined],
    ["/favourite", "DELETE", undefined],
    ["/comments", "GET", undefined],
    ["/comments", "POST", { body: "x" }],
    [`/comments/${comment.id}`, "PATCH", { body: "x" }],
    [`/comments/${comment.id}`, "DELETE", undefined],
  ] as [string, string, object | undefined][]) {
    const res: Response = await t.send(`${other}${suffix}`, method, body, t.bobCookie);
    expect(res.status, `${method} ${suffix}`).toBe(404);
  }
  const bobsOwn: Cocktail = await readJson<Cocktail>(
    await t.send(
      `/api/bars/${t.bob.barId}/cocktails`,
      "POST",
      { name: "Negroni", method: "stirred" },
      t.bobCookie,
    ),
  );
  expect(bobsOwn).toMatchObject({ rating_count: 0, avg_rating: null });
  expect((await t.comments(id)).items).toHaveLength(1);
});

test("comments are paged newest first, edited only by their author", async () => {
  const t = setup();
  const { id } = await t.create("Negroni");
  expect((await t.comment(id, { body: "   " })).status).toBe(400);
  expect((await t.comment(id, { body: "x".repeat(2001) })).status).toBe(400);
  const ids: string[] = [];
  for (const body of ["one", "two", "three"]) {
    const res: Response = await t.comment(id, { body: ` ${body} ` });
    expect(res.status).toBe(201);
    const created: Comment = await readJson<Comment>(res);
    expect(created).toMatchObject({
      body,
      is_private: false,
      cocktail_id: id,
      edited: false,
      author: { id: t.alice.userId },
    });
    ids.push(created.id);
    await tick();
  }
  const first: Page<Comment> = await t.comments(id, "limit=2");
  expect(first.items.map(({ body }) => body)).toEqual(["three", "two"]);
  const second: Page<Comment> = await t.comments(id, `limit=2&cursor=${first.next_cursor}`);
  expect(second.items.map(({ body }) => body)).toEqual(["one"]);
  expect(second.next_cursor).toBeNull();
  expect((await t.send(`${t.path}/${id}/comments?cursor=bad`, "GET")).status).toBe(400);

  const target = `${t.path}/${id}/comments/${ids[0]}`;
  const forbidden: Response = await t.send(target, "PATCH", { body: "hijack" }, t.bobCookie);
  expect(forbidden.status).toBe(403);
  expect((await errorOf(forbidden)).code).toBe("FORBIDDEN");
  expect((await t.send(target, "DELETE", undefined, t.bobCookie)).status).toBe(403);
  expect((await t.send(target, "PATCH", {})).status).toBe(400);
  const unchanged: Comment = await readJson<Comment>(
    await t.send(target, "PATCH", { body: "one", is_private: false }),
  );
  expect(unchanged).toMatchObject({ body: "one", edited: false });
  const edited: Comment = await readJson<Comment>(await t.send(target, "PATCH", { body: "uno" }));
  expect(edited).toMatchObject({ body: "uno", edited: true });
  expect((await t.send(target, "DELETE")).status).toBe(204);
  expect((await t.send(target, "DELETE")).status).toBe(404);
  expect((await t.send(`${t.path}/${id}/comments/nope`, "DELETE")).status).toBe(404);
  expect((await t.comments(id)).items).toHaveLength(2);
});

test("private comments are visible only to their author and paging stays correct", async () => {
  const t = setup();
  const { id } = await t.create("Negroni");
  const bodies: [string, boolean, string | undefined][] = [
    ["a-public", false, undefined],
    ["b-private-alice", true, undefined],
    ["c-public-bob", false, t.bobCookie],
    ["d-private-bob", true, t.bobCookie],
    ["e-public", false, undefined],
  ];
  const created: Comment[] = [];
  for (const [body, is_private, cookie] of bodies) {
    const res: Response = await t.comment(id, { body, is_private }, cookie);
    created.push(await readJson<Comment>(res));
    await tick();
  }
  const names = (page: Page<Comment>): string[] => page.items.map(({ body }) => body);
  expect(names(await t.comments(id))).toEqual([
    "e-public",
    "c-public-bob",
    "b-private-alice",
    "a-public",
  ]);
  const bobAll: Page<Comment> = await t.comments(id, "", t.bobCookie);
  expect(names(bobAll)).toEqual(["e-public", "d-private-bob", "c-public-bob", "a-public"]);
  const page1: Page<Comment> = await t.comments(id, "limit=2", t.bobCookie);
  const page2: Page<Comment> = await t.comments(
    id,
    `limit=2&cursor=${page1.next_cursor}`,
    t.bobCookie,
  );
  expect([...names(page1), ...names(page2)]).toEqual(names(bobAll));
  expect(page2.next_cursor).toBeNull();

  const alicePrivate = `${t.path}/${id}/comments/${created[1]?.id}`;
  expect((await t.send(alicePrivate, "PATCH", { body: "peek" }, t.bobCookie)).status).toBe(404);
  expect((await t.send(alicePrivate, "DELETE", undefined, t.bobCookie)).status).toBe(404);

  // The author flips visibility and can edit the text and visibility together.
  await tick();
  const flipped: Comment = await readJson<Comment>(
    await t.send(alicePrivate, "PATCH", { is_private: false }),
  );
  expect(flipped).toMatchObject({ is_private: false, body: "b-private-alice", edited: true });
  expect(names(await t.comments(id, "", t.bobCookie))).toContain("b-private-alice");
  const both: Comment = await readJson<Comment>(
    await t.send(alicePrivate, "PATCH", { body: "hidden again", is_private: true }),
  );
  expect(both).toMatchObject({ is_private: true, body: "hidden again" });
  expect(names(await t.comments(id, "", t.bobCookie))).not.toContain("hidden again");
});

test("favourites are personal, idempotent and filter the list", async () => {
  const t = setup();
  const negroni: CocktailDetail = await t.create("Negroni");
  const daiquiri: CocktailDetail = await t.create("Daiquiri");
  const fav = (id: string, method: string, cookie?: string): Promise<Response> =>
    t.send(`${t.path}/${id}/favourite`, method, undefined, cookie);
  expect((await fav(negroni.id, "PUT")).status).toBe(204);
  expect((await fav(negroni.id, "PUT")).status).toBe(204);
  expect((await t.detail(negroni.id)).is_favourite).toBe(true);
  expect((await t.detail(negroni.id, t.bobCookie)).is_favourite).toBe(false);
  const names = (page: Page<Cocktail>): string[] => page.items.map(({ name }) => name);
  expect((await t.list()).items.map(({ name, is_favourite }) => [name, is_favourite])).toEqual([
    ["Daiquiri", false],
    ["Negroni", true],
  ]);
  expect(names(await t.list("favourite=true"))).toEqual(["Negroni"]);
  expect(names(await t.list("favourite=true", t.bobCookie))).toEqual([]);
  expect(names(await t.list("favourite=false"))).toEqual(["Daiquiri", "Negroni"]);
  expect(names(await t.list("favourite=true&q=dai"))).toEqual([]);
  await fav(daiquiri.id, "PUT", t.bobCookie);
  expect(names(await t.list("favourite=true", t.bobCookie))).toEqual(["Daiquiri"]);
  expect((await fav(negroni.id, "DELETE")).status).toBe(204);
  expect((await fav(negroni.id, "DELETE")).status).toBe(204);
  expect(names(await t.list("favourite=true"))).toEqual([]);
  expect((await fav(missingId, "PUT")).status).toBe(404);
});

test("lists sort by average rating, unrated last, with stable paging", async () => {
  const t = setup();
  const names: string[] = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
  const created: Record<string, string> = {};
  for (const name of names) created[name] = (await t.create(name)).id;
  const id = (name: string): string => created[name] as string;
  await t.rate(id("Echo"), { score: 5 });
  await t.rate(id("Charlie"), { score: 4 });
  await t.rate(id("Charlie"), { score: 5 }, t.bobCookie);
  await t.rate(id("Bravo"), { score: 5 }, t.bobCookie);
  await t.rate(id("Delta"), { score: 1 });
  const sorted: Page<Cocktail> = await t.list("sort=rating");
  expect(sorted.items.map(({ name, avg_rating }) => [name, avg_rating])).toEqual([
    ["Bravo", 5],
    ["Echo", 5],
    ["Charlie", 4.5],
    ["Delta", 1],
    ["Alpha", null],
  ]);
  expect(sorted.items.find(({ name }) => name === "Echo")?.my_rating).toMatchObject({ score: 5 });
  expect(sorted.items.find(({ name }) => name === "Charlie")).toMatchObject({
    rating_count: 2,
    my_rating: { score: 4 },
  });
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const page: Page<Cocktail> = await t.list(
      `sort=rating&limit=2${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`,
    );
    seen.push(...page.items.map(({ name }) => name));
    cursor = page.next_cursor;
  } while (cursor !== null);
  expect(seen).toEqual(["Bravo", "Echo", "Charlie", "Delta", "Alpha"]);
  expect((await t.list("sort=other")).items).toBeUndefined();
  for (const bad of [
    "",
    "x",
    Buffer.from(JSON.stringify(["no-separator", "id"])).toString("base64url"),
    Buffer.from(JSON.stringify(["\u0001x", "id"])).toString("base64url"),
    Buffer.from(JSON.stringify(["high\u0001x", "id"])).toString("base64url"),
  ]) {
    const res: Response = await t.send(`${t.path}?sort=rating&cursor=${bad}`, "GET");
    expect(res.status).toBe(400);
  }
});

test("deleting a cocktail removes its ratings, comments and favourites", async () => {
  const t = setup();
  const { id } = await t.create("Negroni");
  await t.rate(id, { score: 4 });
  await t.comment(id, { body: "Nice" });
  await t.send(`${t.path}/${id}/favourite`, "PUT");
  expect((await t.send(`${t.path}/${id}`, "DELETE")).status).toBe(204);
  expect((await t.send(`${t.path}/${id}/comments`, "GET")).status).toBe(404);
});

test("rating cursors survive names that contain the cursor separator", async () => {
  const t = setup();
  for (const name of ["a\u0001b", "a\u0001c", "a"]) {
    const { id } = await t.create(name);
    await t.rate(id, { score: 3 });
  }
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const page: Page<Cocktail> = await t.list(
      `sort=rating&limit=1${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`,
    );
    seen.push(...page.items.map(({ name }) => name));
    cursor = page.next_cursor;
  } while (cursor !== null);
  expect(seen).toEqual(["a", "a\u0001b", "a\u0001c"]);
});
