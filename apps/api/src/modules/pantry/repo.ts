import type { Executor } from "../../db/client.ts";
import { pantryIngredients } from "../../db/schema/index.ts";

export type NewPantryIngredient = typeof pantryIngredients.$inferInsert;

export function insertPantryIngredients(db: Executor, values: NewPantryIngredient[]): void {
  db.insert(pantryIngredients).values(values).run();
}
