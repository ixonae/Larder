import type { Executor } from "../../db/client.ts";
import { notFound, parseId } from "../../errors.ts";
import { findCocktail } from "./repo.ts";

/** A cocktail as stored: everything except the values computed or looked up per request. */
export type CocktailRow = NonNullable<ReturnType<typeof findCocktail>>;

export function requireCocktail(db: Executor, barId: string, id: string | undefined): CocktailRow {
  const cocktail = findCocktail(db, barId, parseId(id, "Cocktail"));
  if (!cocktail) throw notFound("Cocktail");
  return cocktail;
}
