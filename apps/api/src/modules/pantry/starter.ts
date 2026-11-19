import { PANTRY_CATEGORY_NAME } from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { insertPantryIngredients } from "./repo.ts";

/** The supplies every new bar starts with, by the starter category they are filed under. */
export const STARTER_PANTRY: Record<string, { name: string; always?: boolean }[]> = {
  Garnish: [{ name: "Lemon" }, { name: "Lime" }, { name: "Mint" }, { name: "Orange" }],
  [PANTRY_CATEGORY_NAME]: [
    { name: "Ice", always: true },
    { name: "Water", always: true },
    { name: "Sugar", always: true },
    { name: "Egg" },
    { name: "Egg white" },
    { name: "Salt" },
  ],
};

/**
 * Inserts the starter pantry ingredients into a new bar, under the starter categories `categoryIds`
 * (by name, as `seedStarterCategories` returns them). Call inside the transaction that creates the bar.
 */
export function seedStarterPantry(
  db: Executor,
  barId: string,
  userId: string,
  categoryIds: Map<string, string>,
): void {
  insertPantryIngredients(
    db,
    Object.entries(STARTER_PANTRY).flatMap(([category, items]) =>
      items.map(({ name, always }) => ({
        bar_id: barId,
        created_by: userId,
        category_id: categoryIds.get(category) as string,
        name,
        always_available: always ?? false,
      })),
    ),
  );
}
