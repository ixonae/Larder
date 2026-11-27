import { barSummarySchema, newId, nowIso } from "@larder/shared";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { insertBar } from "../../modules/bars/repo.ts";
import { createTestApp, errorOf, jsonRequest, type TestApp } from "../../test/app.ts";
import { barDataMigrations, bars, starterImports, users } from "../schema/index.ts";
import {
  checkImportDeadline,
  finishStarterImport,
  MAX_STARTER_BARS,
  recoverStarterImports,
} from "./quota.ts";

const create = (t: TestApp, seed = true): Promise<Response> | Response =>
  t.app.request("/api/bars", jsonRequest("POST", { name: "New bar", seed_data: seed }));

it("reserves the last owner slot before writing artwork and frees it when a seeded bar is deleted", async () => {
  const t = createTestApp();
  const legacy = newId();
  t.db.transaction((tx) => {
    insertBar(tx, legacy, "Legacy", t.alice.userId, "JPY");
    tx.insert(barDataMigrations)
      .values({ bar_id: legacy, migration: "starter-catalogue-v1" })
      .run();
  });
  const started = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const put = t.storage.put;
  const writes = vi.spyOn(t.storage, "put").mockImplementationOnce(async (key, bytes) => {
    started.resolve();
    await resume.promise;
    return put(key, bytes);
  });
  const pending = create(t);
  await started.promise;
  try {
    const calls = writes.mock.calls.length;
    const refused = await create(t);
    expect(refused.status).toBe(409);
    expect((await errorOf(refused)).message).toContain("own");
    expect(writes).toHaveBeenCalledTimes(calls);
    expect((await create(t, false)).status).toBe(201);
  } finally {
    resume.resolve();
  }
  expect((await pending).status).toBe(201);
  expect((await create(t)).status).toBe(409);
  expect(
    (await t.app.request(`/api/bars/${legacy}`, jsonRequest("DELETE", { name: "Legacy" }))).status,
  ).toBe(204);
  expect((await create(t)).status).toBe(201);
});

it("counts legacy seeded bars across owners and keeps existing bars usable above the installation limit", async () => {
  const t = createTestApp();
  t.db
    .insert(bars)
    .values(
      Array.from({ length: MAX_STARTER_BARS }, () => ({
        name: "Earlier bar",
        owner_id: t.bob.userId,
      })),
    )
    .run();
  const writes = vi.spyOn(t.storage, "put");
  const refused = await create(t);
  expect(refused.status).toBe(409);
  expect((await errorOf(refused)).message).toContain("installation");
  expect(writes).not.toHaveBeenCalled();
  expect((await create(t, false)).status).toBe(201);
  const existing = await t.app.request(`/api/bars/${t.alice.barId}`);
  expect(barSummarySchema.parse(await existing.json()).id).toBe(t.alice.barId);
});

it("preserves live reservations across startup and recovers abandoned artwork and capacity after expiry", async () => {
  const t = createTestApp();
  const abandoned = newId();
  const active = newId();
  const expires = nowIso(new Date(Date.now() + 60_000));
  t.db
    .insert(starterImports)
    .values(
      [abandoned, active].map((bar_id) => ({
        bar_id,
        owner_id: t.bob.userId,
        expires_at: expires,
      })),
    )
    .run();
  const artwork = `${abandoned}/picture.webp`;
  await t.storage.put(artwork, new Uint8Array([1]));
  await recoverStarterImports(t.db, t.storage);
  expect((await create(t)).status).toBe(503);
  expect(await t.storage.get(artwork)).not.toBeNull();
  t.db
    .update(starterImports)
    .set({ expires_at: nowIso(new Date(0)) })
    .where(eq(starterImports.bar_id, abandoned))
    .run();
  vi.spyOn(t.storage, "discardStagedBar").mockRejectedValueOnce(new Error("Storage offline"));
  await expect(recoverStarterImports(t.db, t.storage)).rejects.toThrow("Storage offline");
  expect(
    t.db.select().from(starterImports).where(eq(starterImports.bar_id, abandoned)).get(),
  ).toMatchObject({ owner_id: null });
  expect((await create(t)).status).toBe(201);
  expect(await t.storage.get(artwork)).toBeNull();
  expect(t.db.select({ id: starterImports.bar_id }).from(starterImports).all()).toEqual([
    { id: active },
  ]);
});

it("discards staged artwork and releases the slot if the importing account is suspended", async () => {
  const t = createTestApp();
  const put = t.storage.put;
  vi.spyOn(t.storage, "put").mockImplementationOnce(async (key, bytes) => {
    t.db.update(users).set({ disabled: true }).where(eq(users.id, t.alice.userId)).run();
    return put(key, bytes);
  });
  const refused = await create(t);
  expect(refused.status).toBe(401);
  expect(t.db.select().from(starterImports).all()).toEqual([]);
  expect(t.db.select().from(bars).all()).toHaveLength(2);
});

it("stops staging after the deadline and refuses to publish with a missing reservation", () => {
  const t = createTestApp();
  expect(() => checkImportDeadline(nowIso(new Date(0)))).toThrow("timed out");
  expect(() => t.db.transaction((tx) => finishStarterImport(tx, newId(), t.alice.userId))).toThrow(
    "expired",
  );
});
