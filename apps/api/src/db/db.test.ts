import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CurrencyCode } from "@larder/shared";
import type Database from "better-sqlite3";
import { and, eq, getTableName } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { type Db, openDb } from "./client.ts";
import { MIGRATIONS_DIR, runMigrations } from "./migrate.ts";
import {
  barDataMigrations,
  barInvitations,
  barMembers,
  bars,
  bottleComments,
  categories,
  cocktailIngredientAlternatives,
  cocktailIngredients,
  cocktailSteps,
  cocktails,
  cocktailTags,
  cocktailUtensils,
  comments,
  favourites,
  images,
  installationSettings,
  pantryIngredients,
  passwordCredentials,
  productPurchases,
  products,
  ratings,
  sessions,
  tags,
  tastings,
  users,
  utensils,
} from "./schema/index.ts";
import { DEFAULT_BAR_NAME, DEFAULT_USER, seed, seedUser } from "./seed.ts";

function freshDb(): Db {
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

describe("bars table", () => {
  it("defaults the currency to JPY and refuses an unknown one", () => {
    const db = freshDb();
    const { barId } = seedUser(db, { email: "a@x.y", display_name: "A" }, "A");
    const currency = (): CurrencyCode | undefined =>
      db.select().from(bars).where(eq(bars.id, barId)).get()?.currency;
    expect(currency()).toBe("JPY");
    for (const bad of ["jpy", "XXX", ""]) {
      expect(() =>
        db
          .update(bars)
          .set({ currency: bad as "JPY" })
          .where(eq(bars.id, barId))
          .run(),
      ).toThrow(/CHECK/);
    }
    db.update(bars).set({ currency: "EUR" }).where(eq(bars.id, barId)).run();
    expect(currency()).toBe("EUR");
  });
});

describe("products table", () => {
  function setup(): {
    db: Db;
    row: { bar_id: string; created_by: string; name: string };
    aliceCat: string;
    bobCat: string;
  } {
    const db = freshDb();
    const alice = seedUser(db, { email: "a@x.y", display_name: "A" }, "A");
    const bob = seedUser(db, { email: "b@x.y", display_name: "B" }, "B");
    const pick = (barId: string): string =>
      db.select().from(categories).where(eq(categories.bar_id, barId)).get()?.id ?? "";
    const row = { bar_id: alice.barId, created_by: alice.userId, name: "X" };
    return { db, row, aliceCat: pick(alice.barId), bobCat: pick(bob.barId) };
  }

  it.each([
    [
      "a category from another bar",
      (c: string): { category_id: string } => ({ category_id: c }),
      /FOREIGN KEY/,
    ],
    ["an abv over 100", (): { abv: number } => ({ abv: 101 }), /CHECK/],
    ["a negative age", (): { age_years: number } => ({ age_years: -1 }), /CHECK/],
    ["a country name", (): { country: string } => ({ country: "Japan" }), /CHECK/],
    ["a lowercase country code", (): { country: string } => ({ country: "jp" }), /CHECK/],
  ])("refuses %s", (_, override, error) => {
    const { db, row, aliceCat, bobCat } = setup();
    // Bypasses the column's TypeScript type on purpose: the database must refuse it too.
    const values = {
      ...row,
      category_id: aliceCat,
      ...override(bobCat),
    } as typeof products.$inferInsert;
    expect(() => db.insert(products).values(values).run()).toThrow(error);
  });

  it("accepts a country code or no country", () => {
    const { db, row, aliceCat } = setup();
    db.insert(products)
      .values({ ...row, category_id: aliceCat, country: "JP" })
      .run();
    db.insert(products)
      .values({ ...row, name: "Y", category_id: aliceCat, country: null })
      .run();
    expect(db.select({ country: products.country }).from(products).all()).toEqual(
      expect.arrayContaining([{ country: "JP" }, { country: null }]),
    );
  });
});

describe("product_purchases table", () => {
  function setup(): {
    db: Db;
    row: { bar_id: string; created_by: string; product_id: string; bought_on: string };
    bobBottle: string;
  } {
    const db = freshDb();
    const alice = seedUser(db, { email: "a@x.y", display_name: "A" }, "A");
    const bob = seedUser(db, { email: "b@x.y", display_name: "B" }, "B");
    const bottle = (barId: string, userId: string): string => {
      const category = db.select().from(categories).where(eq(categories.bar_id, barId)).get();
      return db
        .insert(products)
        .values({ bar_id: barId, created_by: userId, name: "X", category_id: category?.id ?? "" })
        .returning()
        .get().id;
    };
    const row = {
      bar_id: alice.barId,
      created_by: alice.userId,
      product_id: bottle(alice.barId, alice.userId),
      bought_on: "2026-11-01",
    };
    return { db, row, bobBottle: bottle(bob.barId, bob.userId) };
  }

  it.each([
    [
      "a bottle from another bar",
      (bob: string): { product_id: string } => ({ product_id: bob }),
      /FOREIGN KEY/,
    ],
    [
      "a negative price",
      (): { price_minor: number; currency: string } => ({ price_minor: -1, currency: "JPY" }),
      /CHECK/,
    ],
    ["a price without a currency", (): { price_minor: number } => ({ price_minor: 100 }), /CHECK/],
    ["a currency without a price", (): { currency: string } => ({ currency: "JPY" }), /CHECK/],
    [
      "an unknown currency",
      (): { price_minor: number; currency: string } => ({ price_minor: 1, currency: "XXX" }),
      /CHECK/,
    ],
    [
      "a finish before the purchase",
      (): { finished_on: string } => ({ finished_on: "2026-10-31" }),
      /CHECK/,
    ],
  ])("refuses %s", (_, override, error) => {
    const { db, row, bobBottle } = setup();
    // Bypasses the column types on purpose: the database must refuse it too.
    const values = { ...row, ...override(bobBottle) } as typeof productPurchases.$inferInsert;
    expect(() => db.insert(productPurchases).values(values).run()).toThrow(error);
  });

  it("accepts a priced, finished bottle", () => {
    const { db, row } = setup();
    const values = { ...row, price_minor: 0, currency: "USD", finished_on: row.bought_on } as const;
    db.insert(productPurchases).values(values).run();
    expect(db.select().from(productPurchases).get()).toMatchObject(values);
  });
});

describe("0005 bottle status migration", () => {
  it("turns in_bar bottles into owned ones and leaves the others without a status", () => {
    // Applies the migrations before 0005, adds bottles the old way, then runs the rest.
    const dir = mkdtempSync(join(tmpdir(), "larder-migrations-"));
    try {
      cpSync(MIGRATIONS_DIR, dir, { recursive: true });
      const journalPath = join(dir, "meta", "_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: unknown[] };
      writeFileSync(
        journalPath,
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, 5) }),
      );
      const db = openDb(":memory:");
      migrate(db, { migrationsFolder: dir });
      const { barId, userId } = seedUser(db, { email: "a@x.y", display_name: "A" }, "A");
      const category = db.select().from(categories).where(eq(categories.bar_id, barId)).get();
      const insert = db.$client.prepare(
        "INSERT INTO products (id, bar_id, category_id, name, in_bar, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '', '')",
      );
      insert.run("a", barId, category?.id, "Kept", 1, userId);
      insert.run("b", barId, category?.id, "Gone", 0, userId);
      runMigrations(db);
      expect(
        db.select({ name: products.name, status: products.status }).from(products).all(),
      ).toEqual(
        expect.arrayContaining([
          { name: "Kept", status: "owned" },
          { name: "Gone", status: null },
        ]),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("0006 bottle activity migration", () => {
  it("keeps cocktail favourites, giving each an id", () => {
    const dir = mkdtempSync(join(tmpdir(), "larder-migrations-"));
    try {
      cpSync(MIGRATIONS_DIR, dir, { recursive: true });
      const journalPath = join(dir, "meta", "_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: unknown[] };
      writeFileSync(
        journalPath,
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, 6) }),
      );
      const db = openDb(":memory:");
      migrate(db, { migrationsFolder: dir });
      const { barId, userId } = seedUser(db, { email: "a@x.y", display_name: "A" }, "A");
      const cocktail = db
        .insert(cocktails)
        .values({ bar_id: barId, created_by: userId, name: "Negroni", method: "stirred" })
        .returning()
        .get();
      db.$client
        .prepare(
          "INSERT INTO favourites (bar_id, created_by, created_at, updated_at, cocktail_id) VALUES (?, ?, '2026-11-20T12:00:00.000Z', '', ?)",
        )
        .run(barId, userId, cocktail.id);
      runMigrations(db);
      const [row, ...rest] = db.select().from(favourites).all();
      expect(rest).toEqual([]);
      expect(row).toMatchObject({ cocktail_id: cocktail.id, product_id: null, created_by: userId });
      expect(row?.id).toMatch(/^01a1f8d3-ea00-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(db.$client.pragma("foreign_key_check")).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("favourites table", () => {
  it("holds exactly one bottle or one cocktail, once per user", () => {
    const db = freshDb();
    const { barId, userId } = seedUser(db, { email: "a@x.y", display_name: "A" }, "A");
    const category = db.select().from(categories).where(eq(categories.bar_id, barId)).get();
    const row = { bar_id: barId, created_by: userId };
    const product = db
      .insert(products)
      .values({ ...row, name: "Gin", category_id: category?.id as string })
      .returning()
      .get();
    const cocktail = db
      .insert(cocktails)
      .values({ ...row, name: "Negroni", method: "stirred" })
      .returning()
      .get();
    const add = (target: { product_id?: string; cocktail_id?: string }): Database.RunResult =>
      db
        .insert(favourites)
        .values({ ...row, ...target })
        .run();
    expect(() => add({})).toThrow(/CHECK constraint failed/);
    expect(() => add({ product_id: product.id, cocktail_id: cocktail.id })).toThrow(
      /CHECK constraint failed/,
    );
    add({ product_id: product.id });
    add({ cocktail_id: cocktail.id });
    expect(() => add({ product_id: product.id })).toThrow(/UNIQUE constraint failed/);
    expect(() => add({ cocktail_id: cocktail.id })).toThrow(/UNIQUE constraint failed/);
    db.delete(products).where(eq(products.id, product.id)).run();
    expect(db.select().from(favourites).all()).toMatchObject([{ cocktail_id: cocktail.id }]);
  });
});

describe("pantry_ingredients table", () => {
  function setup(): {
    insert: (name: string, category_id: string) => Database.RunResult;
    pick: (barId: string, name: string) => string;
    alice: { userId: string; barId: string };
    bob: { userId: string; barId: string };
  } {
    const db = freshDb();
    const alice = seedUser(db, { email: "a@x.y", display_name: "A" }, "A");
    const bob = seedUser(db, { email: "b@x.y", display_name: "B" }, "B");
    const pick = (barId: string, name: string): string =>
      db
        .select()
        .from(categories)
        .where(and(eq(categories.bar_id, barId), eq(categories.name, name)))
        .get()?.id ?? "";
    const row = { bar_id: alice.barId, created_by: alice.userId };
    const insert = (name: string, category_id: string): Database.RunResult =>
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
      productPurchases,
      [
        ["bar_id", "bars"],
        ["created_by", "users"],
        ["bar_id", "products"],
      ],
    ],
    [
      pantryIngredients,
      [
        ["bar_id", "bars"],
        ["image_id", "images"],
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
    [
      bottleComments,
      [
        ["bar_id", "bars"],
        ["created_by", "users"],
        ["bar_id", "products"],
      ],
    ],
    [
      tastings,
      [
        ["bar_id", "bars"],
        ["created_by", "users"],
        ["bar_id", "products"],
      ],
    ],
    [
      favourites,
      [
        ["bar_id", "bars"],
        ["created_by", "users"],
        ["bar_id", "products"],
        ["bar_id", "cocktails"],
      ],
    ],
    ...[ratings, comments].map(
      (table) =>
        [
          table,
          [
            ["bar_id", "bars"],
            ["created_by", "users"],
            ["bar_id", "cocktails"],
          ],
        ] as const,
    ),
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
