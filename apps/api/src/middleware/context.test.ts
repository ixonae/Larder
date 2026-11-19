import type { BarSummary, Me } from "@larder/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { barMembers, bars } from "../db/schema/index.ts";
import { BOB, createTestApp } from "../test/app.ts";
import { requireRole } from "./context.ts";

describe("GET /api/me", () => {
  it("returns the current user and their bars", async () => {
    const { app, alice } = createTestApp();
    const res = await app.request("/api/me");
    expect(res.status).toBe(200);
    const me = (await res.json()) as Me;
    expect(me.user).toMatchObject({ id: alice.userId, email: "owner@larder.local" });
    expect(me.bars).toEqual([{ id: alice.barId, name: "Alice's bar", role: "owner" }]);
  });

  it("lists every bar the user is a member of, sorted by name", async () => {
    const { app, db, alice, bob } = createTestApp();
    db.insert(barMembers)
      .values({ bar_id: bob.barId, user_id: alice.userId, role: "viewer" })
      .run();
    const me = (await (await app.request("/api/me")).json()) as Me;
    expect(me.bars.map((b) => [b.name, b.role])).toEqual([
      ["Alice's bar", "owner"],
      ["Bob's bar", "viewer"],
    ]);
  });

  it("sorts bar names case-insensitively", async () => {
    const { app, db, alice, bob } = createTestApp();
    db.update(bars).set({ name: "Zed" }).where(eq(bars.id, alice.barId)).run();
    db.update(bars).set({ name: "alpha" }).where(eq(bars.id, bob.barId)).run();
    db.insert(barMembers)
      .values({ bar_id: bob.barId, user_id: alice.userId, role: "viewer" })
      .run();
    const me = (await (await app.request("/api/me")).json()) as Me;
    expect(me.bars.map((b) => b.name)).toEqual(["alpha", "Zed"]);
  });

  it("refuses requests when the current user does not exist", async () => {
    const { app } = createTestApp({ as: "nobody@larder.local" });
    const res = await app.request("/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "No current user" },
    });
  });
});

describe("barAccess", () => {
  it("lets a member read their bar", async () => {
    const { app, alice } = createTestApp();
    const res = await app.request(`/api/bars/${alice.barId}`);
    expect(res.status).toBe(200);
    expect((await res.json()) as BarSummary).toEqual({
      id: alice.barId,
      name: "Alice's bar",
      role: "owner",
    });
  });

  it("cannot read another bar's data (non-member gets 403)", async () => {
    const { app, bob } = createTestApp();
    const res = await app.request(`/api/bars/${bob.barId}`);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
  });

  it("works the same way for the other user", async () => {
    const { app, alice, bob } = createTestApp({ as: BOB.email });
    expect((await app.request(`/api/bars/${bob.barId}`)).status).toBe(200);
    expect((await app.request(`/api/bars/${alice.barId}`)).status).toBe(403);
  });

  it.each([
    ["an unknown bar", "01a1f326-d941-7d74-8a40-504a488cd388"],
    ["a malformed id", "not-a-uuid"],
  ])("answers 404 for %s", async (_, barId) => {
    const { app } = createTestApp();
    const res = await app.request(`/api/bars/${barId}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Bar not found" } });
  });
});

describe("requireRole", () => {
  function setup(role: "viewer" | "editor" | "owner") {
    const t = createTestApp();
    t.db.insert(barMembers).values({ bar_id: t.bob.barId, user_id: t.alice.userId, role }).run();
    t.app.post("/api/bars/:barId/edit", requireRole("editor"), (c) => c.json({ ok: true }));
    return { ...t, url: `/api/bars/${t.bob.barId}/edit` };
  }

  it("refuses a viewer", async () => {
    const { app, url } = setup("viewer");
    const res = await app.request(url, { method: "POST" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: "FORBIDDEN", message: "This action needs the editor role" },
    });
  });

  it.each(["editor", "owner"] as const)("allows an %s", async (role) => {
    const { app, url } = setup(role);
    expect((await app.request(url, { method: "POST" })).status).toBe(200);
  });
});
