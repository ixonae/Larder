import { and, eq, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { openDb } from "./client.ts";
import { runMigrations } from "./migrate.ts";
import {
  barDataMigrations,
  barInvitations,
  barMembers,
  bars,
  categories,
  cocktailIngredientAlternatives,
  cocktailIngredients,
  cocktailSteps,
  cocktails,
  cocktailTags,
  cocktailUtensils,
  images,
  installationSettings,
  pantryIngredients,
  passwordCredentials,
  products,
  sessions,
  tags,
  users,
  utensils,
} from "./schema/index.ts";
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
  it("applies migrations once and can run again without changing their history", () => {
    const db = freshDb();
    const history = db.$client.prepare(
      "SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at",
    );
    const initial = history.all();
    expect(initial).not.toHaveLength(0);
    runMigrations(db);
    expect(history.all()).toEqual(initial);
    expect(db.$client.pragma("foreign_key_check")).toEqual([]);
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

describe("collation", () => {
  it("compares accented names in root and sibling uniqueness indexes", () => {
    const db = freshDb();
    const sqlite = db.$client;
    sqlite.exec(`
      CREATE TEMP TABLE names (bar TEXT NOT NULL, parent TEXT, name TEXT NOT NULL);
      CREATE UNIQUE INDEX root_names ON names(bar, larder_name_key(name)) WHERE parent IS NULL;
      CREATE UNIQUE INDEX child_names ON names(bar, parent, larder_name_key(name)) WHERE parent IS NOT NULL;
    `);
    const insert = sqlite.prepare("INSERT INTO names VALUES (?, ?, ?)");
    for (const parent of [null, "liqueurs"]) {
      insert.run("a", parent, "Crème");
      expect(() => insert.run("a", parent, "CRÈME".normalize("NFD"))).toThrow(/UNIQUE/);
      insert.run("a", parent, "Creme");
      insert.run("b", parent, "CRÈME");
    }
    insert.run("a", "syrups", "Crème");
  });

  it("treats emails that differ only in case as duplicates", () => {
    const db = freshDb();
    seed(db);
    expect(() =>
      db.insert(users).values({ email: DEFAULT_USER.email.toUpperCase(), display_name: "X" }).run(),
    ).toThrow(/UNIQUE/);
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

describe("categories table", () => {
  it("refuses a parent from another bar and an abv over 100", () => {
    const db = freshDb();
    const alice = seedUser(db, { email: "a@x.y", display_name: "A" }, "A");
    const bob = seedUser(db, { email: "b@x.y", display_name: "B" }, "B");
    const [bobsRoot] = db.select().from(categories).where(eq(categories.bar_id, bob.barId)).all();
    const row = {
      bar_id: alice.barId,
      created_by: alice.userId,
      name: "X",
      kind: "other" as const,
    };
    expect(() =>
      db
        .insert(categories)
        .values({ ...row, parent_id: bobsRoot?.id })
        .run(),
    ).toThrow(/FOREIGN KEY/);
    expect(() =>
      db
        .insert(categories)
        .values({ ...row, default_abv: 101 })
        .run(),
    ).toThrow(/CHECK/);
  });
});

describe("products table", () => {
  function setup() {
    const db = freshDb();
    const alice = seedUser(db, { email: "a@x.y", display_name: "A" }, "A");
    const bob = seedUser(db, { email: "b@x.y", display_name: "B" }, "B");
    const pick = (barId: string) =>
      db.select().from(categories).where(eq(categories.bar_id, barId)).get()?.id ?? "";
    const row = { bar_id: alice.barId, created_by: alice.userId, name: "X" };
    return { db, row, aliceCat: pick(alice.barId), bobCat: pick(bob.barId) };
  }

  it.each([
    ["a category from another bar", (c: string) => ({ category_id: c }), /FOREIGN KEY/],
    ["an abv over 100", () => ({ abv: 101 }), /CHECK/],
    ["a negative age", () => ({ age_years: -1 }), /CHECK/],
  ])("refuses %s", (_, override, error) => {
    const { db, row, aliceCat, bobCat } = setup();
    const values = { ...row, category_id: aliceCat, ...override(bobCat) };
    expect(() => db.insert(products).values(values).run()).toThrow(error);
  });
});

describe("pantry_ingredients table", () => {
  function setup() {
    const db = freshDb();
    const alice = seedUser(db, { email: "a@x.y", display_name: "A" }, "A");
    const bob = seedUser(db, { email: "b@x.y", display_name: "B" }, "B");
    const pick = (barId: string, name: string) =>
      db
        .select()
        .from(categories)
        .where(and(eq(categories.bar_id, barId), eq(categories.name, name)))
        .get()?.id ?? "";
    const row = { bar_id: alice.barId, created_by: alice.userId };
    const insert = (name: string, category_id: string) =>
      db
        .insert(pantryIngredients)
        .values({ ...row, name, category_id })
        .run();
    return { insert, pick, alice, bob };
  }

  it("refuses a category from another bar", () => {
    const { insert, pick, bob } = setup();
    expect(() => insert("Yuzu", pick(bob.barId, "Garnish"))).toThrow(/FOREIGN KEY/);
  });

  it("refuses the same name twice in a category, ignoring case and accents form", () => {
    const { insert, pick, alice } = setup();
    expect(() => insert("LEMON", pick(alice.barId, "Garnish"))).toThrow(/UNIQUE/);
    insert("Crème", pick(alice.barId, "Pantry"));
    expect(() => insert("CRÈME".normalize("NFD"), pick(alice.barId, "Pantry"))).toThrow(/UNIQUE/);
    expect(() => insert("Lemon", pick(alice.barId, "Pantry"))).not.toThrow();
  });
});

describe("utensils table", () => {
  it.each([
    ["a capacity on a tool", { kind: "tool" as const, capacity_ml: 100 }],
    ["a zero capacity", { kind: "glass" as const, capacity_ml: 0 }],
  ])("refuses %s", (_, values) => {
    const db = freshDb();
    const { userId, barId } = seed(db);
    const row = { bar_id: barId, created_by: userId, name: "X", ...values };
    expect(() => db.insert(utensils).values(row).run()).toThrow(/CHECK/);
  });
});

describe("schema", () => {
  it.each([
    [bars, [["owner_id", "users"]]],
    [barDataMigrations, [["bar_id", "bars"]]],
    [
      barInvitations,
      [
        ["bar_id", "bars"],
        ["created_by", "users"],
      ],
    ],
    [passwordCredentials, [["user_id", "users"]]],
    [sessions, [["user_id", "users"]]],
    [installationSettings, []],
    [
      tags,
      [
        ["bar_id", "bars"],
        ["created_by", "users"],
      ],
    ],
    [
      cocktailSteps,
      [
        ["bar_id", "bars"],
        ["created_by", "users"],
        ["bar_id", "cocktails"],
      ],
    ],
    [
      cocktailTags,
      [
        ["bar_id", "bars"],
        ["created_by", "users"],
        ["bar_id", "cocktails"],
        ["bar_id", "tags"],
      ],
    ],
    [
      cocktailUtensils,
      [
        ["bar_id", "bars"],
        ["created_by", "users"],
        ["bar_id", "cocktails"],
        ["bar_id", "utensils"],
      ],
    ],
    [
      cocktailIngredients,
      [
        ["bar_id", "bars"],
        ["created_by", "users"],
        ["bar_id", "cocktails"],
        ["bar_id", "categories"],
        ["bar_id", "products"],
        ["bar_id", "pantry_ingredients"],
      ],
    ],
    [
      cocktailIngredientAlternatives,
      [
        ["bar_id", "bars"],
        ["created_by", "users"],
        ["bar_id", "cocktail_ingredients"],
        ["bar_id", "categories"],
        ["bar_id", "products"],
        ["bar_id", "pantry_ingredients"],
      ],
    ],
    [
      cocktails,
      [
        ["bar_id", "bars"],
        ["created_by", "users"],
        ["image_id", "images"],
        ["bar_id", "utensils"],
        ["bar_id", "cocktails"],
      ],
    ],
    [
      images,
      [
        ["bar_id", "bars"],
        ["created_by", "users"],
      ],
    ],
    [
      barMembers,
      [
        ["bar_id", "bars"],
        ["user_id", "users"],
      ],
    ],
    [
      categories,
      [
        ["bar_id", "bars"],
        ["image_id", "images"],
        ["created_by", "users"],
        ["bar_id", "categories"],
      ],
    ],
    [
      products,
      [
        ["bar_id", "bars"],
        ["image_id", "images"],
        ["created_by", "users"],
        ["bar_id", "categories"],
      ],
    ],
    [
      pantryIngredients,
      [
        ["bar_id", "bars"],
        ["created_by", "users"],
        ["bar_id", "categories"],
      ],
    ],
    [
      utensils,
      [
        ["bar_id", "bars"],
        ["image_id", "images"],
        ["created_by", "users"],
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

it("can use indexes to find child rows for every foreign key", () => {
  const db = freshDb().$client;
  const keys = db
    .prepare(`
    SELECT m.name AS child, f.id AS fk, f."from" AS column
    FROM sqlite_schema m CROSS JOIN pragma_foreign_key_list(m.name) f
    WHERE m.type = 'table'
    ORDER BY m.name, f.id, f.seq
  `)
    .all() as { child: string; fk: number; column: string }[];
  const constraints = Map.groupBy(keys, ({ child, fk }) => `${child}/${fk}`);
  for (const columns of constraints.values()) {
    const table = columns[0]?.child;
    const match = columns.map(({ column }) => `"${column}" = 'key'`).join(" AND ");
    const plan = db
      .prepare(`EXPLAIN QUERY PLAN SELECT rowid FROM "${table}" WHERE ${match}`)
      .get() as {
      detail: string;
    };
    expect(plan.detail).toMatch(/^SEARCH /);
    for (const { column } of columns) expect(plan.detail).toContain(`${column}=?`);
  }
});
