import {
  adminBarsSchema,
  adminUserSchema,
  adminUsersSchema,
  barSummarySchema,
  meSchema,
  newId,
  pageSchema,
  usedBySchema,
  utensilSchema,
} from "@larder/shared";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../../auth/password.ts";
import { updateSignupSettings } from "../../auth/repo.ts";
import {
  changePassword,
  requireOwnerAccount,
  setOwnerPassword,
  signIn,
  signUp,
} from "../../auth/service.ts";
import {
  barMembers,
  bars,
  categories,
  cocktails,
  comments,
  favourites,
  images,
  passwordCredentials,
  productPurchases,
  ratings,
  sessions,
  users,
} from "../../db/schema/index.ts";
import { ALICE, BOB, cookieFor, createTestApp, errorOf, jsonRequest } from "../../test/app.ts";

const password = "a long admin password";
const changed = "a long replacement password";
const account = { email: "visitor@example.com", display_name: "Visitor", password };
let hash: string;
let replacement: string;
beforeAll(async () => {
  [hash, replacement] = await Promise.all([hashPassword(password), hashPassword(changed)]);
});

function setup() {
  const t = createTestApp();
  setOwnerPassword(t.db, t.alice.userId, hash, false);
  const cookie = (id: string) => cookieFor(t.db, id);
  const admin = cookie(t.alice.userId);
  const member = cookie(t.bob.userId);
  const request = (path: string, method = "GET", body?: unknown, session = admin) =>
    t.app.request(path, jsonRequest(method, body, session));
  const login = (email: string, password: string) =>
    request("/api/auth/sign-in", "POST", { email, password }, "");
  return { ...t, cookie, admin, member, request, login };
}

describe("installation administration", () => {
  it("checks installation admin separately from bar ownership", async () => {
    const t = setup();
    expect((await t.request("/api/admin/users", "GET", undefined, "")).status).toBe(401);
    expect((await t.request("/api/admin/users", "GET", undefined, t.member)).status).toBe(403);
    const accounts = adminUsersSchema.parse(await (await t.request("/api/admin/users")).json());
    expect(accounts.users.find(({ id }) => id === t.alice.userId)).toMatchObject({
      is_admin: true,
    });
    expect(accounts.users.find(({ id }) => id === t.bob.userId)).toMatchObject({ is_admin: false });
    const bars = adminBarsSchema.parse(await (await t.request("/api/admin/bars")).json());
    expect(bars.bars.map(({ id, owner }) => [id, owner.id])).toEqual([
      [t.alice.barId, t.alice.userId],
      [t.bob.barId, t.bob.userId],
    ]);
    expect((await t.request(`/api/bars/${t.bob.barId}/cocktails`)).status).toBe(403);
  });

  it("lets admin create and disable accounts, revokes sessions, and lets enabled users sign in again", async () => {
    const t = setup();
    const created = await t.request("/api/admin/users", "POST", account);
    expect(created.status).toBe(201);
    const user = adminUserSchema.parse(await created.json());
    expect(user).toMatchObject({ disabled: false, is_admin: false, email: account.email });
    expect((await t.request("/api/admin/users", "POST", account)).status).toBe(409);

    const session = t.cookie(user.id);
    expect((await t.request("/api/me", "GET", undefined, session)).status).toBe(200);
    const url = `/api/admin/users/${user.id}`;
    expect((await t.request(url, "PATCH", { disabled: true })).status).toBe(200);
    expect((await t.request("/api/me", "GET", undefined, session)).status).toBe(401);
    expect((await t.login(account.email, password)).status).toBe(401);
    expect((await t.request(url, "PATCH", { disabled: false })).status).toBe(200);
    expect((await t.request("/api/me", "GET", undefined, session)).status).toBe(401);
    expect((await t.login(account.email, password)).status).toBe(204);
    expect(
      (await t.request(`/api/admin/users/${t.alice.userId}`, "PATCH", { disabled: true })).status,
    ).toBe(404);
  });

  it("enforces invite-only, open, and admin-only signup policies", async () => {
    const t = setup();
    const publicSettings = "/api/auth/signup-settings";
    const policy = "/api/admin/signup-settings";
    const publicSignup = () => t.request("/api/auth/sign-up", "POST", account, "");
    expect(await (await t.request(publicSettings, "GET", undefined, "")).json()).toEqual({
      signup_mode: "invite_only",
    });
    expect((await publicSignup()).status).toBe(403);
    expect((await t.request(policy, "PATCH", { signup_mode: "open" })).status).toBe(200);
    const res = await publicSignup();
    expect(res.status).toBe(204);
    const session = res.headers.get("Set-Cookie")?.split(";")[0] as string;
    const data = meSchema.parse(
      await (await t.request("/api/me", "GET", undefined, session)).json(),
    );
    expect(data.bars).toEqual([]);
    expect(data.user).toMatchObject({ email: account.email, is_admin: false });
    expect((await t.request(policy, "PATCH", { signup_mode: "closed" })).status).toBe(200);
    expect((await publicSignup()).status).toBe(403);

    const invitation = await t.request(`/api/bars/${t.alice.barId}/invitations`, "POST", {
      role: "viewer",
    });
    const { url } = (await invitation.json()) as { url: string };
    const token = new URL(url).hash.slice(1);
    expect(
      await (await t.request("/api/invitations/preview", "POST", { token }, "")).json(),
    ).toMatchObject({ can_register: false });
    expect(
      (await t.request("/api/invitations/register", "POST", { ...account, token }, "")).status,
    ).toBe(403);
    expect((await t.request("/api/invitations/accept", "POST", { token }, session)).status).toBe(
      200,
    );
    expect(
      (await t.request("/api/admin/users", "POST", { ...account, email: "allowed@example.com" }))
        .status,
    ).toBe(201);
  });

  it("rechecks signup policy after a password hash finishes", async () => {
    const t = setup();
    updateSignupSettings(t.db, { signup_mode: "open" });
    const attempt = signUp(t.db, account, "");
    updateSignupSettings(t.db, { signup_mode: "closed" });
    await expect(attempt).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(t.db.select().from(users).all()).toHaveLength(2);
  });
});

describe("bar management", () => {
  it("seeds only the selected bar and allows an owner to delete its contents and files", async () => {
    const t = setup();
    const res = await t.request("/api/bars", "POST", { name: "Seeded", seed_data: true });
    expect(res.status).toBe(201);
    const bar = barSummarySchema.parse(await res.json());
    const rows = () => t.db.select().from(cocktails).where(eq(cocktails.bar_id, bar.id)).all();
    expect(rows().length).toBeGreaterThan(100);
    const glassware = await t.request(`/api/bars/${bar.id}/utensils?kind=glass`);
    expect(glassware.status).toBe(200);
    const { items } = pageSchema(utensilSchema).parse(await glassware.json());
    expect(items).toHaveLength(48);
    expect(items.every(({ image_id }) => image_id !== null)).toBe(true);
    expect(items.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "Champagne flute",
        "Collins glass",
        "Margarita glass",
        "Nick & Nora glass",
        "Shot glass",
      ]),
    );
    const tools = await t.request(`/api/bars/${bar.id}/utensils?kind=tool`);
    expect(tools.status).toBe(200);
    const seededTools = pageSchema(utensilSchema).parse(await tools.json()).items;
    expect(seededTools).toHaveLength(15);
    expect(seededTools.every(({ image_id }) => image_id !== null)).toBe(true);
    const shaker = seededTools.find(({ name }) => name === "Shaker");
    const thumbnail = await t.request(`/api/images/${shaker?.image_id}/thumb`);
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers.get("content-type")).toBe("image/webp");
    await t.storage.put(`${bar.id}/test.webp`, Buffer.from("a"));
    await t.storage.put(`${bar.id}/test-thumb.webp`, Buffer.from("b"));
    t.db
      .insert(images)
      .values({
        bar_id: bar.id,
        created_by: t.alice.userId,
        storage_key: `${bar.id}/test.webp`,
        thumb_key: `${bar.id}/test-thumb.webp`,
        mime: "image/webp",
        width: 1,
        height: 1,
        size_bytes: 1,
      })
      .run();
    t.db.insert(barMembers).values({ bar_id: bar.id, user_id: t.bob.userId, role: "editor" }).run();
    const path = `/api/bars/${bar.id}`;
    expect((await t.request(path, "DELETE", { name: bar.name }, t.member)).status).toBe(403);
    expect((await t.request(path, "DELETE")).status).toBe(400);
    expect((await t.request(path, "DELETE", { name: bar.name.toLowerCase() })).status).toBe(409);
    expect(rows().length).toBeGreaterThan(100);
    expect(await t.storage.get(`${bar.id}/test.webp`)).toEqual(Buffer.from("a"));
    expect((await t.request(path, "DELETE", { name: bar.name })).status).toBe(204);
    expect(rows()).toEqual([]);
    expect(await t.storage.get(`${bar.id}/test.webp`)).toBeNull();
    expect(await t.storage.get(`${bar.id}/test-thumb.webp`)).toBeNull();
    expect(t.db.$client.pragma("foreign_key_check")).toEqual([]);
    expect((await t.request("/api/me")).status).toBe(200);
    expect(t.db.select().from(bars).all()).toHaveLength(2);
  });

  it("allows installation admins to delete a bar without making them members", async () => {
    const t = setup();
    const path = `/api/admin/bars/${t.bob.barId}`;
    const confirmation = { name: "Bob's bar" };
    expect((await t.request(path, "DELETE", confirmation, t.member)).status).toBe(403);
    expect((await t.request(path, "DELETE", { name: "Alice's bar" })).status).toBe(409);
    expect((await t.request(path, "DELETE", confirmation)).status).toBe(204);
    expect((await t.request(path, "DELETE", confirmation)).status).toBe(404);
    expect(t.db.select().from(bars).all()).toHaveLength(1);
    expect(t.db.select().from(users).all()).toHaveLength(2);
  });
});

describe("account settings", () => {
  it("validates email changes, preserves identity, and rotates the session", async () => {
    const t = setup();
    const patch = (email: string, current_password: string, session = t.admin) =>
      t.request("/api/me/email", "PATCH", { email, current_password }, session);
    expect((await patch("new@example.com", password, "")).status).toBe(401);
    expect((await patch("invalid", password)).status).toBe(400);
    expect((await patch("new@example.com", "wrong")).status).toBe(400);
    expect((await patch("bob@example.com", password, t.member)).status).toBe(400);
    expect((await patch(BOB.email.toUpperCase(), password)).status).toBe(409);
    const res = await patch(" NEW@Example.com ", password);
    expect(res.status).toBe(204);
    expect((await t.request("/api/me")).status).toBe(401);
    const session = res.headers.get("Set-Cookie")?.split(";")[0] as string;
    const me = meSchema.parse(await (await t.request("/api/me", "GET", undefined, session)).json());
    expect(me.user).toMatchObject({ id: t.alice.userId, email: "new@example.com", is_admin: true });
    expect((await t.login(ALICE.email, password)).status).toBe(401);
    expect((await t.login("new@example.com", password)).status).toBe(204);
    expect((await patch("new@example.com", password, session)).status).toBe(204);
  });

  it("requires matching replacement passwords and signs out old sessions on change", async () => {
    const t = setup();
    const additional = t.cookie(t.alice.userId);
    const patch = (confirm_password: string) =>
      t.request("/api/me/password", "PATCH", {
        current_password: password,
        new_password: changed,
        confirm_password,
      });
    expect((await patch("does not match")).status).toBe(400);
    const res = await patch(changed);
    expect(res.status).toBe(204);
    expect((await t.request("/api/me", "GET", undefined, additional)).status).toBe(401);
    const session = res.headers.get("Set-Cookie")?.split(";")[0] as string;
    expect((await t.request("/api/me", "GET", undefined, session)).status).toBe(200);
    expect((await t.login(ALICE.email, password)).status).toBe(401);
    expect((await t.login(ALICE.email, changed)).status).toBe(204);
  });

  it("rejects old password proofs interrupted by credential reset or deletion", async () => {
    const t = setup();
    const replacementData = {
      current_password: password,
      new_password: changed,
      confirm_password: changed,
    };
    const updating = changePassword(t.db, t.alice.userId, replacementData);
    const loggingIn = signIn(t.db, { email: ALICE.email, password }, "");
    setOwnerPassword(t.db, t.alice.userId, replacement, true);
    await Promise.all([
      expect(updating).rejects.toMatchObject({ code: "VALIDATION" }),
      expect(loggingIn).rejects.toMatchObject({ code: "UNAUTHORIZED" }),
    ]);
    const secondLogin = signIn(t.db, { email: ALICE.email, password: changed }, "");
    t.db.delete(passwordCredentials).where(eq(passwordCredentials.user_id, t.alice.userId)).run();
    await expect(secondLogin).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(() => requireOwnerAccount(t.db)).toThrow("setup-owner");
  });
});

describe("user administration", () => {
  it("records successful sign-ins and keeps that timestamp when an admin resets the password", async () => {
    const t = setup();
    const accountResponse = await t.request("/api/admin/users", "POST", account);
    const user = adminUserSchema.parse(await accountResponse.json());
    const readLastLogin = async () => {
      const data = adminUsersSchema.parse(await (await t.request("/api/admin/users")).json());
      return data.users.find(({ id }) => id === user.id)?.last_login_at;
    };
    expect(user.last_login_at).toBeNull();
    expect((await t.login(user.email, "wrong password")).status).toBe(401);
    expect(await readLastLogin()).toBeNull();

    const before = Date.now();
    const login = await t.login(user.email, password);
    expect(login.status).toBe(204);
    const loggedInAt = await readLastLogin();
    expect(Date.parse(loggedInAt as string)).toBeGreaterThanOrEqual(before);
    const session = login.headers.get("Set-Cookie")?.split(";")[0] as string;
    const path = `/api/admin/users/${user.id}/password`;
    const reset = { new_password: changed, confirm_password: changed };
    expect((await t.request(path, "PATCH", reset, session)).status).toBe(403);
    expect(
      (await t.request(path, "PATCH", { ...reset, confirm_password: "mismatch" })).status,
    ).toBe(400);
    expect((await t.request("/api/me", "GET", undefined, session)).status).toBe(200);
    expect((await t.request(path, "PATCH", reset)).status).toBe(204);
    expect(await readLastLogin()).toBe(loggedInAt);
    expect((await t.request("/api/me", "GET", undefined, session)).status).toBe(401);
    expect((await t.login(user.email, password)).status).toBe(401);
    const nextLogin = await t.login(user.email, changed);
    expect(nextLogin.status).toBe(204);
    expect(Date.parse((await readLastLogin()) as string)).toBeGreaterThan(
      Date.parse(loggedInAt as string),
    );
    expect(
      (await t.request(`/api/admin/users/${t.alice.userId}/password`, "PATCH", reset)).status,
    ).toBe(404);
  }, 15_000);

  it("hard-deletes an account and its credentials, sessions and memberships after exact email confirmation", async () => {
    const t = setup();
    const created = await t.request("/api/admin/users", "POST", account);
    const user = adminUserSchema.parse(await created.json());
    const session = t.cookie(user.id);
    t.db.insert(barMembers).values({ bar_id: t.bob.barId, user_id: user.id, role: "viewer" }).run();
    // Personal feedback does not block the deletion; it goes with the account.
    const drinks = `/api/bars/${t.bob.barId}/cocktails`;
    const drink = await t.request(drinks, "POST", { name: "Negroni", method: "stirred" }, t.member);
    const feedback = `${drinks}/${((await drink.json()) as { id: string }).id}`;
    expect((await t.request(`${feedback}/rating`, "PUT", { score: 4 }, session)).status).toBe(200);
    expect((await t.request(`${feedback}/favourite`, "PUT", undefined, session)).status).toBe(204);
    for (const is_private of [false, true]) {
      const res = await t.request(
        `${feedback}/comments`,
        "POST",
        { body: "Hi", is_private },
        session,
      );
      expect(res.status).toBe(201);
    }
    const path = `/api/admin/users/${user.id}`;
    const confirmation = { email: user.email };
    expect((await t.request(path, "DELETE", confirmation, t.member)).status).toBe(403);
    expect((await t.request(path, "DELETE")).status).toBe(400);
    expect((await t.request(path, "DELETE", { email: user.email.toUpperCase() })).status).toBe(409);
    expect((await t.request("/api/me", "GET", undefined, session)).status).toBe(200);
    expect((await t.request(path, "DELETE", confirmation)).status).toBe(204);
    expect(t.db.select().from(users).where(eq(users.id, user.id)).get()).toBeUndefined();
    expect(
      t.db.select().from(passwordCredentials).where(eq(passwordCredentials.user_id, user.id)).get(),
    ).toBeUndefined();
    expect(t.db.select().from(sessions).where(eq(sessions.user_id, user.id)).get()).toBeUndefined();
    for (const table of [ratings, favourites, comments]) {
      expect(t.db.select().from(table).where(eq(table.created_by, user.id)).all()).toEqual([]);
    }
    expect(
      t.db.select().from(barMembers).where(eq(barMembers.user_id, user.id)).get(),
    ).toBeUndefined();
    expect((await t.request("/api/me", "GET", undefined, session)).status).toBe(401);
    expect((await t.request(path, "DELETE", confirmation)).status).toBe(404);
    expect(
      (await t.request(`/api/admin/users/${t.alice.userId}`, "DELETE", { email: ALICE.email }))
        .status,
    ).toBe(404);
  });

  it("refuses to delete owners or authors of bar data and lists the affected bars", async () => {
    const t = setup();
    const userId = newId();
    t.db
      .insert(users)
      .values({ id: userId, email: account.email, display_name: account.display_name })
      .run();
    t.db
      .insert(barMembers)
      .values({ bar_id: t.alice.barId, user_id: userId, role: "editor" })
      .run();
    const session = t.cookie(userId);
    expect(
      (
        await t.request(
          `/api/bars/${t.alice.barId}/utensils`,
          "POST",
          { name: "Coupe", kind: "glass" },
          session,
        )
      ).status,
    ).toBe(201);
    for (const [id, email, barId, name] of [
      [userId, account.email, t.alice.barId, "Alice's bar"],
      [t.bob.userId, BOB.email, t.bob.barId, "Bob's bar"],
    ] as const) {
      const result = await t.request(`/api/admin/users/${id}`, "DELETE", { email });
      expect(result.status).toBe(409);
      expect(usedBySchema.parse((await errorOf(result)).details)).toEqual({
        used_by: [{ type: "bar", id: barId, name }],
      });
    }
    expect((await t.request("/api/me", "GET", undefined, session)).status).toBe(200);
    const utensils = await t.request(`/api/bars/${t.alice.barId}/utensils`);
    expect(await utensils.json()).toMatchObject({ items: [{ name: "Coupe" }] });
  });

  it("refuses to delete the author of a bottle purchase and keeps the purchase", async () => {
    const t = setup();
    const userId = newId();
    t.db
      .insert(users)
      .values({ id: userId, email: account.email, display_name: account.display_name })
      .run();
    t.db
      .insert(barMembers)
      .values({ bar_id: t.alice.barId, user_id: userId, role: "editor" })
      .run();
    const bottles = `/api/bars/${t.alice.barId}/products`;
    const category = t.db
      .select()
      .from(categories)
      .where(eq(categories.bar_id, t.alice.barId))
      .get();
    const created = await t.request(bottles, "POST", { name: "Gin X", category_id: category?.id });
    const { id } = (await created.json()) as { id: string };
    const session = t.cookie(userId);
    const bought = await t.request(
      `${bottles}/${id}/purchases`,
      "POST",
      { bought_on: "2026-11-01" },
      session,
    );
    expect(bought.status).toBe(201);
    const result = await t.request(`/api/admin/users/${userId}`, "DELETE", {
      email: account.email,
    });
    expect(result.status).toBe(409);
    expect(usedBySchema.parse((await errorOf(result)).details)).toEqual({
      used_by: [{ type: "bar", id: t.alice.barId, name: "Alice's bar" }],
    });
    expect(t.db.select().from(productPurchases).all()).toMatchObject([{ created_by: userId }]);
  });
});

it("lets a bar owner rename their bar and preserves existing memberships and invitations", async () => {
  const t = setup();
  t.db
    .insert(barMembers)
    .values({ bar_id: t.alice.barId, user_id: t.bob.userId, role: "editor" })
    .run();
  const path = `/api/bars/${t.alice.barId}`;
  const invite = await t.request(`${path}/invitations`, "POST", { role: "viewer" });
  const { url } = (await invite.json()) as { url: string };
  const token = new URL(url).hash.slice(1);
  expect((await t.request(path, "PATCH", { name: "Other" }, t.member)).status).toBe(403);
  expect((await t.request(`/api/bars/${t.bob.barId}`, "PATCH", { name: "Other" })).status).toBe(
    403,
  );
  expect((await t.request(path, "PATCH", { name: " " })).status).toBe(400);
  const result = await t.request(path, "PATCH", { name: " Rooftop " });
  expect(result.status).toBe(200);
  expect(barSummarySchema.parse(await result.json())).toEqual({
    id: t.alice.barId,
    name: "Rooftop",
    currency: "JPY",
    role: "owner",
  });
  const me = meSchema.parse(await (await t.request("/api/me", "GET", undefined, t.member)).json());
  expect(me.bars).toContainEqual({
    id: t.alice.barId,
    name: "Rooftop",
    currency: "JPY",
    role: "editor",
  });
  expect(
    await (await t.request("/api/invitations/preview", "POST", { token }, "")).json(),
  ).toMatchObject({ bar_name: "Rooftop" });
});
