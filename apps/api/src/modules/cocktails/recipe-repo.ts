import { type ListTagsQuery, nameKey as normalizeTag } from "@larder/shared";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { Executor } from "../../db/client.ts";
import { afterName, byName, type NameCursor } from "../../db/cursor.ts";
import {
  cocktailSteps,
  cocktails,
  cocktailTags,
  cocktailUtensils,
  tags,
  utensils,
} from "../../db/schema/index.ts";
import { nameKey } from "./repo.ts";

const steps: typeof cocktailSteps = cocktailSteps;
const tools: typeof cocktailUtensils = cocktailUtensils;
const tagColumns: Pick<typeof tags, "id" | "name"> = { id: tags.id, name: tags.name };
const tagKey: SQL<string> = sql<string>`larder_name_key(${tags.name})`;
type RecipeOwner = { bar_id: string; created_by: string; cocktail_id: string };

/** Keep each insert below SQLite's parameter limit even for a large recipe. */
const STEP_BATCH_SIZE = 250;

export function insertSteps(db: Executor, owner: RecipeOwner, input: { text: string }[]): void {
  for (let offset = 0; offset < input.length; offset += STEP_BATCH_SIZE) {
    const batch = input.slice(offset, offset + STEP_BATCH_SIZE).map(({ text }, index) => ({
      ...owner,
      position: offset + index,
      text,
    }));
    db.insert(steps).values(batch).run();
  }
}

export function replaceSteps(db: Executor, owner: RecipeOwner, input: { text: string }[]): void {
  db.delete(steps)
    .where(and(eq(steps.bar_id, owner.bar_id), eq(steps.cocktail_id, owner.cocktail_id)))
    .run();
  insertSteps(db, owner, input);
}

export function insertTools(db: Executor, owner: RecipeOwner, toolIds: string[]): void {
  for (const utensil_id of new Set(toolIds))
    db.insert(tools)
      .values({ ...owner, utensil_id })
      .run();
}

export function replaceTools(db: Executor, owner: RecipeOwner, toolIds: string[]): void {
  db.delete(tools)
    .where(and(eq(tools.bar_id, owner.bar_id), eq(tools.cocktail_id, owner.cocktail_id)))
    .run();
  insertTools(db, owner, toolIds);
}

export function replaceTags(db: Executor, owner: RecipeOwner, names: string[]): void {
  db.delete(cocktailTags)
    .where(
      and(eq(cocktailTags.bar_id, owner.bar_id), eq(cocktailTags.cocktail_id, owner.cocktail_id)),
    )
    .run();
  const seen = new Set<string>();
  for (const name of names) {
    const key = normalizeTag(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = db
      .select(tagColumns)
      .from(tags)
      .where(and(eq(tags.bar_id, owner.bar_id), eq(tagKey, key)))
      .get();
    const tag =
      existing ??
      db
        .insert(tags)
        .values({ name, bar_id: owner.bar_id, created_by: owner.created_by })
        .returning(tagColumns)
        .get();
    db.insert(cocktailTags)
      .values({ ...owner, tag_id: tag.id })
      .run();
  }
}

export function listSteps(
  db: Executor,
  barId: string,
  cocktailId: string,
): { id: string; text: string; position: number }[] {
  return db
    .select({ id: steps.id, text: steps.text, position: steps.position })
    .from(steps)
    .where(and(eq(steps.bar_id, barId), eq(steps.cocktail_id, cocktailId)))
    .orderBy(steps.position)
    .all();
}

export function listTools(
  db: Executor,
  barId: string,
  cocktailId: string,
): { id: string; name: string }[] {
  return db
    .select({ id: utensils.id, name: utensils.name })
    .from(tools)
    .innerJoin(utensils, and(eq(utensils.bar_id, tools.bar_id), eq(utensils.id, tools.utensil_id)))
    .where(and(eq(tools.bar_id, barId), eq(tools.cocktail_id, cocktailId)))
    .orderBy(...byName(sql`larder_name_key(${utensils.name})`, utensils.id))
    .all();
}

export function listCocktailTags(
  db: Executor,
  barId: string,
  cocktailId: string,
): { id: string; name: string }[] {
  return db
    .select(tagColumns)
    .from(cocktailTags)
    .innerJoin(tags, and(eq(tags.bar_id, cocktailTags.bar_id), eq(tags.id, cocktailTags.tag_id)))
    .where(and(eq(cocktailTags.bar_id, barId), eq(cocktailTags.cocktail_id, cocktailId)))
    .orderBy(...byName(tagKey, tags.id))
    .all();
}

export function listToolUsage(
  db: Executor,
  barId: string,
  toolId: string,
): { id: string; name: string }[] {
  return db
    .select({ id: cocktails.id, name: cocktails.name })
    .from(tools)
    .innerJoin(
      cocktails,
      and(eq(cocktails.bar_id, tools.bar_id), eq(cocktails.id, tools.cocktail_id)),
    )
    .where(and(eq(tools.bar_id, barId), eq(tools.utensil_id, toolId)))
    .orderBy(...byName(nameKey, cocktails.id))
    .all();
}

export function listTags(
  db: Executor,
  barId: string,
  { q, limit }: ListTagsQuery,
  after: NameCursor | undefined,
): { id: string; name: string; key: string }[] {
  return db
    .select({ ...tagColumns, key: tagKey })
    .from(tags)
    .where(
      and(
        eq(tags.bar_id, barId),
        q === undefined ? undefined : sql`instr(${tagKey}, larder_name_key(${q})) > 0`,
        afterName(tagKey, tags.id, after),
      ),
    )
    .orderBy(...byName(tagKey, tags.id))
    .limit(limit)
    .all();
}
