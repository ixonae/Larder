import type { MissingIngredient } from "@larder/shared";

/** "Lemon or Bottled lemon juice": a missing line with the substitutes that would also do. */
export const missingLabel = ({ name, alternatives }: MissingIngredient): string =>
  [name, ...alternatives].join(" or ");
