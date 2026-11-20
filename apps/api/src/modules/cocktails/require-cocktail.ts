import type { Cocktail } from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { notFound, parseId } from "../../errors.ts";
import type { PersonalSummary } from "./feedback.ts";
import { findCocktail } from "./repo.ts";

/** A cocktail as stored: everything except the values computed or looked up per request. */
export type CocktailRow = Omit<Cocktail, "computed" | "missing" | keyof PersonalSummary>;

export function requireCocktail(db: Executor, barId: string, id: string | undefined): CocktailRow {
  const cocktail: CocktailRow | undefined = findCocktail(db, barId, parseId(id, "Cocktail"));
  if (!cocktail) throw notFound("Cocktail");
  return cocktail;
}
