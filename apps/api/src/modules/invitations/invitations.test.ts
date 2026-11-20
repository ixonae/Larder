import {
  barMembersSchema,
  barSummarySchema,
  invitationLinkSchema,
  invitationPreviewSchema,
  meSchema,
  newId,
  pendingInvitationsSchema,
  SESSION_REQUEST_HEADER,
} from "@larder/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hashToken } from "../../auth/token.ts";
import { migrateStarterCatalogues } from "../../db/catalogue/starter.ts";
import { barInvitations, barMembers, cocktails, users } from "../../db/schema/index.ts";
import { ALICE, BOB, cookieFor, createTestApp, jsonRequest } from "../../test/app.ts";

const origin = "https://bar.example.test";
const password = "a long new account password";

function setup(publicUrl?: string) {
  const t = createTestApp({ publicUrl });
  const bars = (id: string) => `/api/bars/${id}`;
  const invitations = `${bars(t.alice.barId)}/invitations`;
  const bobCookie = cookieFor(t.db, t.bob.userId);
  const auth = (cookie: string, method: string, data?: unknown) =>
    jsonRequest(method, data, cookie);
  const post = (action: string, data: unknown, cookie = "") =>
    t.app.request(`/api/invitations/${action}`, auth(cookie, "POST", data));
  const createInvite = async (role: "viewer" | "editor") => {
    const res = await t.app.request(invitations, jsonRequest("POST", { role }));
    expect(res.status).toBe(201);
    const invitation = invitationLinkSchema.parse(await res.json());
    return { ...invitation, token: new URL(invitation.url).hash.slice(1) };
  };
  const getMe = async (cookie: string) => {
    const res = await t.app.request("/api/me", auth(cookie, "GET"));
    return meSchema.parse(await res.json());
  };
  return { ...t, bars, invitations, bobCookie, auth, post, createInvite, getMe };
}

describe("bars and invitations", () => {
  it("creates a bar with only its owning user and keeps its data isolated through startup", async () => {
    const t = setup();
    const body = jsonRequest("POST", { name: " Patio " });
    expect(
      (
        await t.rawRequest("/api/bars", {
          ...body,
          headers: { ...body.headers, [SESSION_REQUEST_HEADER]: "1" },
        })
      ).status,
    ).toBe(401);
    const response = await t.app.request("/api/bars", body);
    expect(response.status).toBe(201);
    const bar = barSummarySchema.parse(await response.json());
    expect(bar).toMatchObject({ name: "Patio", role: "owner" });
    expect((await t.getMe(t.cookie as string)).bars).toContainEqual(bar);
    expect((await t.app.request(t.bars(bar.id), t.auth(t.bobCookie, "GET"))).status).toBe(403);
    await migrateStarterCatalogues(t.db, t.storage);
    expect(t.db.select().from(cocktails).where(eq(cocktails.bar_id, bar.id)).all()).toEqual([]);
    const categories = await t.app.request(`${t.bars(bar.id)}/categories/tree`);
    expect(((await categories.json()) as { items: unknown[] }).items).toEqual([]);
  });

  it("gives only owners permission to issue, list or revoke an invitation", async () => {
    const t = setup();
    expect(
      (await t.app.request(t.invitations, t.auth(t.bobCookie, "POST", { role: "editor" }))).status,
    ).toBe(403);
    t.db
      .insert(barMembers)
      .values({ bar_id: t.alice.barId, user_id: t.bob.userId, role: "editor" })
      .run();
    expect(
      (await t.app.request(t.invitations, t.auth(t.bobCookie, "POST", { role: "editor" }))).status,
    ).toBe(403);
    expect((await t.app.request(t.invitations, t.auth(t.bobCookie, "GET"))).status).toBe(403);
    const { id } = await t.createInvite("viewer");
    expect(
      (await t.app.request(`${t.invitations}/${id}`, t.auth(t.bobCookie, "DELETE"))).status,
    ).toBe(403);
    expect(
      (await t.app.request(t.invitations, jsonRequest("POST", { role: "owner" }))).status,
    ).toBe(400);
  });

  it("uses the public domain for links, keeps tokens private, and isolates revocation to the correct bar", async () => {
    const t = setup(origin);
    const { id, url, role, token, expires_at } = await t.createInvite("viewer");
    expect(new URL(url).origin).toBe(origin);
    expect(new URL(url).pathname).toBe("/invite");
    expect(new URL(url).search).toBe("");
    expect(t.db.select().from(barInvitations).get()).toMatchObject({
      id,
      token_hash: hashToken(token),
      created_by: t.alice.userId,
    });
    const list = pendingInvitationsSchema.parse(await (await t.app.request(t.invitations)).json());
    expect(list.invitations).toEqual([{ id, role, expires_at }]);
    const preview = await t.post("preview", { token });
    expect(invitationPreviewSchema.parse(await preview.json())).toEqual({
      bar_name: "Alice's bar",
      role,
      expires_at,
      can_register: true,
    });
    expect(
      (
        await t.app.request(
          `${t.bars(t.bob.barId)}/invitations/${id}`,
          t.auth(t.bobCookie, "DELETE"),
        )
      ).status,
    ).toBe(204);
    expect((await t.post("preview", { token })).status).toBe(200);
    expect((await t.app.request(`${t.invitations}/${id}`, { method: "DELETE" })).status).toBe(204);
    expect((await t.post("preview", { token })).status).toBe(404);
  });

  it("joins an existing account with a single-use link and never changes an existing role", async () => {
    const t = setup();
    const { token, url } = await t.createInvite("viewer");
    expect(new URL(url).origin).toBe("http://localhost");
    expect((await t.post("accept", { token })).status).toBe(401);
    expect((await t.post("accept", { token }, t.cookie)).status).toBe(409);
    const responses = await Promise.all([
      t.post("accept", { token }, t.bobCookie),
      t.post("accept", { token }, t.bobCookie),
    ]);
    expect(responses.map((res) => res.status).sort()).toEqual([200, 404]);
    const bob = await t.getMe(t.bobCookie);
    expect(bob.bars).toContainEqual({
      id: t.alice.barId,
      name: "Alice's bar",
      currency: "JPY",
      role: "viewer",
    });
    expect(
      (await t.app.request(`${t.bars(t.alice.barId)}/cocktails`, t.auth(t.bobCookie, "GET")))
        .status,
    ).toBe(200);
    expect(
      (
        await t.app.request(
          `${t.bars(t.alice.barId)}/utensils`,
          t.auth(t.bobCookie, "POST", { name: "Coupe", kind: "glass" }),
        )
      ).status,
    ).toBe(403);
    const members = await t.app.request(
      `${t.bars(t.alice.barId)}/members`,
      t.auth(t.bobCookie, "GET"),
    );
    expect(await members.json()).toEqual(
      barMembersSchema.parse({
        members: [
          { id: t.bob.userId, display_name: BOB.display_name, role: "viewer" },
          { id: t.alice.userId, display_name: ALICE.display_name, role: "owner" },
        ],
      }),
    );
    const editor = await t.createInvite("editor");
    expect((await t.post("accept", { token: editor.token }, t.bobCookie)).status).toBe(409);
    expect((await t.getMe(t.bobCookie)).bars[0]?.role).toBe("viewer");
    expect((await t.post("preview", { token: editor.token })).status).toBe(200);
  });

  it("signs up an invited editor and attributes their writes to their account", async () => {
    const t = setup();
    const { token } = await t.createInvite("editor");
    const email = "new@example.com";
    const response = await t.post("register", { token, email, display_name: "Charlie", password });
    expect(response.status).toBe(201);
    const cookie = response.headers.get("Set-Cookie")?.split(";")[0] as string;
    const { user, bars } = await t.getMe(cookie);
    expect(user).toMatchObject({ display_name: "Charlie", email });
    expect(bars).toEqual([
      { id: t.alice.barId, name: "Alice's bar", currency: "JPY", role: "editor" },
    ]);
    expect((await t.app.request(t.bars(t.bob.barId), t.auth(cookie, "GET"))).status).toBe(403);
    const result = await t.app.request(
      `${t.bars(t.alice.barId)}/cocktails`,
      t.auth(cookie, "POST", {
        name: "Gin drink",
        method: "built",
      }),
    );
    expect(result.status).toBe(201);
    expect(t.db.select().from(cocktails).get()?.created_by).toBe(user.id);
    expect(
      (await t.app.request("/api/auth/sign-in", t.auth("", "POST", { email, password }))).status,
    ).toBe(204);
    expect(
      (
        await t.post("register", {
          token,
          email: "other@example.com",
          display_name: "Other",
          password,
        })
      ).status,
    ).toBe(404);
  });

  it("rejects expired links and existing email addresses without consuming a valid link", async () => {
    const t = setup();
    const expired = await t.createInvite("viewer");
    t.db.update(barInvitations).set({ expires_at: "2000-01-01T00:00:00.000Z" }).run();
    expect((await t.post("preview", { token: expired.token })).status).toBe(404);
    const invite = await t.createInvite("editor");
    expect(t.db.select().from(barInvitations).all()).toHaveLength(1);
    expect(
      (
        await t.post("register", {
          token: invite.token,
          email: BOB.email.toUpperCase(),
          display_name: "Imposter",
          password,
        })
      ).status,
    ).toBe(409);
    expect((await t.post("preview", { token: invite.token })).status).toBe(200);
    expect((await t.post("preview", { token: newId() })).status).toBe(400);
    expect(t.db.select().from(users).all()).toHaveLength(2);
  });

  it("creates one account when two guests race to register from a single invite", async () => {
    const t = setup();
    const { token } = await t.createInvite("editor");
    const responses = await Promise.all(
      ["first@example.com", "second@example.com"].map((email) =>
        t.post("register", { token, email, display_name: "Guest", password }),
      ),
    );
    expect(responses.map((res) => res.status).sort()).toEqual([201, 404]);
    expect(t.db.select().from(users).all()).toHaveLength(3);
  });
});
