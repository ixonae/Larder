import { type BarSummary, barMembersSchema, CURRENCY_CODES, type Me } from "@larder/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { barMembers, bars } from "../../db/schema/index.ts";
import {
  cookieFor,
  createTestApp,
  errorOf,
  readJson as json,
  jsonRequest,
} from "../../test/app.ts";

const currencyOf = (t: ReturnType<typeof createTestApp>, barId: string) =>
  t.db.select({ currency: bars.currency }).from(bars).where(eq(bars.id, barId)).get()?.currency;

describe("bar currency", () => {
  it("is JPY for the seeded bars and for a new bar", async () => {
    const t = createTestApp();
    expect(currencyOf(t, t.alice.barId)).toBe("JPY");
    expect(currencyOf(t, t.bob.barId)).toBe("JPY");
    const created = await t.app.request("/api/bars", jsonRequest("POST", { name: "Roof" }));
    expect(created.status).toBe(201);
    expect(await json<BarSummary>(created)).toMatchObject({ name: "Roof", currency: "JPY" });
    const me = await json<Me>(await t.app.request("/api/me"));
    expect(me.bars.map((bar) => bar.currency)).toEqual(["JPY", "JPY"]);
  });

  it("can be chosen when creating a bar, with or without the starter catalogue", async () => {
    const t = createTestApp();
    for (const seed_data of [false, true]) {
      const res = await t.app.request(
        "/api/bars",
        jsonRequest("POST", { name: `Bar ${seed_data}`, currency: "EUR", seed_data }),
      );
      expect(res.status).toBe(201);
      const bar = await json<BarSummary>(res);
      expect(bar.currency).toBe("EUR");
      expect(currencyOf(t, bar.id)).toBe("EUR");
      expect((await json<BarSummary>(await t.app.request(`/api/bars/${bar.id}`))).currency).toBe(
        "EUR",
      );
    }
  });

  it("refuses an invalid currency when creating a bar", async () => {
    const t = createTestApp();
    for (const currency of ["jpy", "XXX", "Yen", ""]) {
      const res = await t.app.request("/api/bars", jsonRequest("POST", { name: "X", currency }));
      expect(res.status).toBe(400);
      expect((await errorOf(res)).code).toBe("VALIDATION");
    }
  });

  it("is changed by the owner, alone or with the name, without touching anything else", async () => {
    const t = createTestApp();
    const path = `/api/bars/${t.alice.barId}`;
    const patch = (body: unknown) => t.app.request(path, jsonRequest("PATCH", body));

    const first = await patch({ currency: "USD" });
    expect(first.status).toBe(200);
    expect(await json<BarSummary>(first)).toEqual({
      id: t.alice.barId,
      name: "Alice's bar",
      currency: "USD",
      role: "owner",
    });
    expect(await json<BarSummary>(await t.app.request(path))).toMatchObject({ currency: "USD" });

    const both = await patch({ name: "Roof", currency: "KWD" });
    expect(await json<BarSummary>(both)).toMatchObject({ name: "Roof", currency: "KWD" });
    const rename = await patch({ name: "Terrace" });
    expect(await json<BarSummary>(rename)).toMatchObject({ name: "Terrace", currency: "KWD" });
    expect(currencyOf(t, t.alice.barId)).toBe("KWD");
  });

  it.each([CURRENCY_CODES[0], "JPY", "KWD", CURRENCY_CODES.at(-1)])(
    "saves %s",
    async (currency) => {
      const t = createTestApp();
      const res = await t.app.request(
        `/api/bars/${t.alice.barId}`,
        jsonRequest("PATCH", { currency }),
      );
      expect(res.status).toBe(200);
      expect(currencyOf(t, t.alice.barId)).toBe(currency);
    },
  );

  it("refuses invalid codes and empty updates", async () => {
    const t = createTestApp();
    const path = `/api/bars/${t.alice.barId}`;
    for (const body of [{ currency: "jpy" }, { currency: "XAU" }, { currency: "" }, {}]) {
      const res = await t.app.request(path, jsonRequest("PATCH", body));
      expect(res.status).toBe(400);
      expect((await errorOf(res)).code).toBe("VALIDATION");
    }
    expect(currencyOf(t, t.alice.barId)).toBe("JPY");
  });

  it.each(["editor", "viewer"] as const)("cannot be changed by a %s", async (role) => {
    const t = createTestApp();
    t.db.insert(barMembers).values({ bar_id: t.bob.barId, user_id: t.alice.userId, role }).run();
    const res = await t.app.request(
      `/api/bars/${t.bob.barId}`,
      jsonRequest("PATCH", { currency: "USD" }),
    );
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("FORBIDDEN");
    expect(currencyOf(t, t.bob.barId)).toBe("JPY");
  });

  it("changes only the bar it is set on", async () => {
    const t = createTestApp();
    await t.app.request(`/api/bars/${t.alice.barId}`, jsonRequest("PATCH", { currency: "GBP" }));
    expect(currencyOf(t, t.alice.barId)).toBe("GBP");
    expect(currencyOf(t, t.bob.barId)).toBe("JPY");
  });
});

describe("bar member management", () => {
  it("changes the member's permissions for their existing session and removes only this bar's access", async () => {
    const t = createTestApp();
    const bar = `/api/bars/${t.alice.barId}`;
    const member = `${bar}/members/${t.bob.userId}`;
    const session = cookieFor(t.db, t.bob.userId);
    const asBob = (path: string, method = "GET", body?: unknown) =>
      t.app.request(path, jsonRequest(method, body, session));
    const changeRole = (role: string) => t.app.request(member, jsonRequest("PATCH", { role }));
    t.db
      .insert(barMembers)
      .values({ bar_id: t.alice.barId, user_id: t.bob.userId, role: "viewer" })
      .run();

    const glass = { name: "Bob's glass", kind: "glass" };
    expect((await asBob(`${bar}/utensils`, "POST", glass)).status).toBe(403);
    expect((await changeRole("editor")).status).toBe(204);
    const edit = await asBob(`${bar}/utensils`, "POST", glass);
    expect(edit.status).toBe(201);
    const { id } = await json<{ id: string }>(edit);
    const list = barMembersSchema.parse(await (await t.app.request(`${bar}/members`)).json());
    expect(list.members).toContainEqual({ id: t.bob.userId, display_name: "Bob", role: "editor" });
    expect((await changeRole("viewer")).status).toBe(204);
    expect((await asBob(`${bar}/utensils/${id}`, "PATCH", { name: "Coupe" })).status).toBe(403);
    expect((await asBob(`${bar}/utensils/${id}`)).status).toBe(200);

    expect((await t.app.request(member, jsonRequest("DELETE"))).status).toBe(204);
    expect((await asBob(`${bar}/utensils/${id}`)).status).toBe(403);
    const me = await json<Me>(await asBob("/api/me"));
    expect(me.bars.map(({ id }) => id)).toEqual([t.bob.barId]);
    expect((await asBob(`/api/bars/${t.bob.barId}`)).status).toBe(200);
    expect(await json(await t.app.request(`${bar}/utensils/${id}`))).toMatchObject(glass);
  });

  it("refuses edits outside the bar, edits from non-owners, and changes to the owner", async () => {
    const t = createTestApp();
    const members = `/api/bars/${t.alice.barId}/members`;
    const owner = `${members}/${t.alice.userId}`;
    const member = `${members}/${t.bob.userId}`;
    const patch = jsonRequest("PATCH", { role: "editor" });
    const remove = jsonRequest("DELETE");
    expect((await t.app.request(member, patch)).status).toBe(404);
    expect((await t.app.request(member, remove)).status).toBe(404);
    expect((await t.app.request(owner, patch)).status).toBe(409);
    expect((await t.app.request(owner, remove)).status).toBe(409);
    const otherBar = `/api/bars/${t.bob.barId}/members/${t.bob.userId}`;
    expect((await t.app.request(otherBar, patch)).status).toBe(403);
    expect((await t.app.request(otherBar, remove)).status).toBe(403);

    const session = cookieFor(t.db, t.bob.userId);
    for (const role of ["viewer", "editor"] as const) {
      t.db
        .insert(barMembers)
        .values({ bar_id: t.alice.barId, user_id: t.bob.userId, role })
        .onConflictDoUpdate({ target: [barMembers.bar_id, barMembers.user_id], set: { role } })
        .run();
      expect(
        (await t.app.request(member, jsonRequest("PATCH", { role: "editor" }, session))).status,
      ).toBe(403);
      expect((await t.app.request(member, jsonRequest("DELETE", undefined, session))).status).toBe(
        403,
      );
    }
    expect((await t.app.request(member, jsonRequest("PATCH", { role: "owner" }))).status).toBe(400);
  });
});
