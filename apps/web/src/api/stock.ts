import type { QueryKey } from "@tanstack/react-query";
import { cocktailsKey } from "./cocktails.ts";

/**
 * `meta` for mutations that change stock (bottles in the bar, Pantry ingredients): every screen whose
 * data depends on stock is refreshed after them. Add new stock-derived queries here.
 */
export const stockMeta = (barId: string): { invalidates: QueryKey[] } => ({
  invalidates: [cocktailsKey(barId)],
});
