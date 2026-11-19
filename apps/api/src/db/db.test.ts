import { eq, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { openDb } from "./client.ts";
import { runMigrations } from "./migrate.ts";
import { barMembers, bars, users } from "./schema/index.ts";
import { DEFAULT_BAR_NAME, DEFAULT_USER, seed, seedUser } from "./seed.ts";

function freshDb() {
  const db = openDb(":memory:");
  runMigrations(db);
  return db;
}

describe("openDb", () => {
  it("enables foreign keys", () => {
    const db = freshDb();
    expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(() => db.insert(bars).values({ name: "x", owner_id: "missing" }).run()).toThrow(
      /FOREIGN KEY/,
    );
  });

  it("sets a busy timeout", () => {
    expect(freshDb().$client.pragma("busy_timeout", { simple: true })).toBe(5000);
  });
});

describe("runMigrations", () => {
  it("can run twice", () => {
    const db = freshDb();
    expect(() => runMigrations(db)).not.toThrow();
  });

  it("refuses unknown roles", () => {
    const db = freshDb();
    const { userId, barId } = seed(db);
    db.delete(barMembers).run();
    expect(() =>
      db.$client
        .prepare(
          "INSERT INTO bar_members (bar_id, user_id, role, created_at) VALUES (?, ?, 'admin', '')",
        )
        .run(barId, userId),
    ).toThrow(/CHECK/);
  });
});

describe("seed", () => {
  it("creates the default user, a bar and the owner membership", () => {
    const db = freshDb();
    const { userId, barId } = seed(db);
    expect(db.select().from(users).all()).toMatchObject([{ id: userId, ...DEFAULT_USER }]);
    expect(db.select().from(bars).all()).toMatchObject([
      { id: barId, name: DEFAULT_BAR_NAME, owner_id: userId },
    ]);
    expect(db.select().from(barMembers).all()).toMatchObject([
      { bar_id: barId, user_id: userId, role: "owner" },
    ]);
  });

  it("is idempotent", () => {
    const db = freshDb();
    const first = seed(db);
    const second = seed(db);
    expect(second).toEqual(first);
    expect(db.select().from(users).all()).toHaveLength(1);
    expect(db.select().from(bars).all()).toHaveLength(1);
    expect(db.select().from(barMembers).all()).toHaveLength(1);
  });

  it("keeps an existing user's first owned bar", () => {
    const db = freshDb();
    const { userId, barId } = seedUser(db, { email: "x@y.z", display_name: "X" }, "First");
    db.insert(bars).values({ name: "Second", owner_id: userId }).run();
    expect(seedUser(db, { email: "x@y.z", display_name: "X" }).barId).toBe(barId);
  });

  it("sets timestamps and refreshes updated_at on update", async () => {
    const db = freshDb();
    const { barId } = seed(db);
    const before = db.select().from(bars).where(eq(bars.id, barId)).get();
    expect(before?.created_at).toMatch(/Z$/);
    await new Promise((r) => setTimeout(r, 5));
    db.update(bars).set({ name: "Renamed" }).where(eq(bars.id, barId)).run();
    const after = db.select().from(bars).where(eq(bars.id, barId)).get();
    expect((after?.updated_at ?? "") > (before?.updated_at ?? "")).toBe(true);
    expect(after?.created_at).toBe(before?.created_at);
  });
});

describe("schema", () => {
  it.each([
    [bars, [["owner_id", "users"]]],
    [
      barMembers,
      [
        ["bar_id", "bars"],
        ["user_id", "users"],
      ],
    ],
  ] as const)("declares the foreign keys of %#", (table, expected) => {
    const fks = getTableConfig(table).foreignKeys.map((fk) => {
      const ref = fk.reference();
      return [ref.columns[0]?.name, getTableName(ref.foreignTable)];
    });
    expect(fks).toEqual(expected);
  });
});
