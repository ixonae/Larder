import type { ListCocktailsQuery } from "@larder/shared";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { Executor } from "../../db/client.ts";
import { afterName, byName, type NameCursor } from "../../db/cursor.ts";
import { cocktails } from "../../db/schema/index.ts";

const { bar_id: _barId, created_by: _createdBy, ...columns } = getTableColumns(cocktails);
const nameKey = sql<string>`larder_name_key(${cocktails.name})`;
export type NewCocktail = typeof cocktails.$inferInsert;

const inBar = (barId: string, id: string) => and(eq(cocktails.bar_id, barId), eq(cocktails.id, id));

export function listCocktails(
  db: Executor,
  barId: string,
  { q, method, glass_id, limit }: ListCocktailsQuery,
  after: NameCursor | undefined,
) {
  return db
    .select({ ...columns, key: nameKey })
    .from(cocktails)
    .where(
      and(
        eq(cocktails.bar_id, barId),
        q === undefined ? undefined : sql`instr(${nameKey}, larder_name_key(${q})) > 0`,
        method === undefined ? undefined : eq(cocktails.method, method),
        glass_id === undefined ? undefined : eq(cocktails.glass_id, glass_id),
        afterName(nameKey, cocktails.id, after),
      ),
    )
    .orderBy(...byName(nameKey, cocktails.id))
    .limit(limit)
    .all();
}

export function findCocktail(db: Executor, barId: string, id: string) {
  return db.select(columns).from(cocktails).where(inBar(barId, id)).get();
}

export function insertCocktail(db: Executor, input: NewCocktail) {
  return db.insert(cocktails).values(input).returning(columns).get();
}

export function updateCocktail(
  db: Executor,
  barId: string,
  id: string,
  patch: Partial<NewCocktail>,
) {
  return db.update(cocktails).set(patch).where(inBar(barId, id)).returning(columns).get();
}

export function deleteCocktail(db: Executor, barId: string, id: string) {
  db.delete(cocktails).where(inBar(barId, id)).run();
}

export function listCocktailReferences(
  db: Executor,
  barId: string,
  field: "glass_id" | "variant_of_id",
  id: string,
) {
  return db
    .select({ id: cocktails.id, name: cocktails.name })
    .from(cocktails)
    .where(and(eq(cocktails.bar_id, barId), eq(cocktails[field], id)))
    .orderBy(...byName(nameKey, cocktails.id))
    .all();
}
