import type { Utensil, UtensilKind } from "@larder/shared";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { Executor } from "../../db/client.ts";
import { afterName, byName, type NameCursor } from "../../db/cursor.ts";
import { utensils } from "../../db/schema/index.ts";
import { selectArtworkKey } from "../images/repo.ts";

const columns: Pick<
  typeof utensils,
  "id" | "name" | "kind" | "capacity_ml" | "description" | "image_id" | "created_at" | "updated_at"
> & { image_artwork_key: SQL<string | null> } = {
  id: utensils.id,
  name: utensils.name,
  kind: utensils.kind,
  capacity_ml: utensils.capacity_ml,
  description: utensils.description,
  image_id: utensils.image_id,
  image_artwork_key: selectArtworkKey(utensils),
  created_at: utensils.created_at,
  updated_at: utensils.updated_at,
};

const nameKey: SQL<string> = sql<string>`larder_name_key(${utensils.name})`;

export type NewUtensil = typeof utensils.$inferInsert;
export type UtensilChanges = Partial<
  Pick<NewUtensil, "name" | "kind" | "capacity_ml" | "description">
>;

export interface UtensilFilter {
  q?: string;
  kind?: UtensilKind;
  after?: NameCursor;
  limit: number;
}

/** One page of the bar's utensils sorted by name; each row carries its name `key` for the cursor. */
export function listUtensils(
  db: Executor,
  barId: string,
  { q, kind, after, limit }: UtensilFilter,
): (Utensil & { key: string })[] {
  return db
    .select({ ...columns, key: nameKey })
    .from(utensils)
    .where(
      and(
        eq(utensils.bar_id, barId),
        q === undefined ? undefined : sql`instr(${nameKey}, larder_name_key(${q})) > 0`,
        kind === undefined ? undefined : eq(utensils.kind, kind),
        afterName(nameKey, utensils.id, after),
      ),
    )
    .orderBy(...byName(nameKey, utensils.id))
    .limit(limit)
    .all();
}

export function findUtensil(db: Executor, barId: string, id: string): Utensil | undefined {
  return db
    .select(columns)
    .from(utensils)
    .where(and(eq(utensils.bar_id, barId), eq(utensils.id, id)))
    .get();
}

export function insertUtensil(db: Executor, values: NewUtensil): string {
  return db.insert(utensils).values(values).returning({ id: utensils.id }).get().id;
}

export function updateUtensil(
  db: Executor,
  barId: string,
  id: string,
  changes: UtensilChanges,
): void {
  db.update(utensils)
    .set(changes)
    .where(and(eq(utensils.bar_id, barId), eq(utensils.id, id)))
    .run();
}

export function deleteUtensil(db: Executor, barId: string, id: string): void {
  db.delete(utensils)
    .where(and(eq(utensils.bar_id, barId), eq(utensils.id, id)))
    .run();
}
