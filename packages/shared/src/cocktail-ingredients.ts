import { z } from "zod";
import { DESCRIPTION_MAX } from "./categories.ts";
import { idSchema } from "./id.ts";
import { matchingBottleSchema } from "./makeability.ts";
import { optionalText } from "./text.ts";
import { unitNeedsAmount, unitSchema } from "./units.ts";

const refs = {
  category_id: idSchema.nullable(),
  product_id: idSchema.nullable(),
  pantry_ingredient_id: idSchema.nullable(),
};

/** Each preferred source or substitute names exactly one catalogue entry. */
export const ingredientSourceSchema = z.union([
  z.object({
    category_id: idSchema,
    product_id: z.null().optional(),
    pantry_ingredient_id: z.null().optional(),
  }),
  z.object({
    category_id: z.null().optional(),
    product_id: idSchema,
    pantry_ingredient_id: z.null().optional(),
  }),
  z.object({
    category_id: z.null().optional(),
    product_id: z.null().optional(),
    pantry_ingredient_id: idSchema,
  }),
]);
export type IngredientSource = z.infer<typeof ingredientSourceSchema>;
const note = optionalText(DESCRIPTION_MAX);
const preparation = z.object({ note: note.optional() });
const quantity = z.object({
  amount: z.number().positive().nullable().optional(),
  unit: unitSchema,
  optional: z.boolean().default(false),
  /** Required for preparation but left out of the served drink (for example a rinse). */
  preparation_only: z.boolean().default(false),
});

export const MAX_INGREDIENT_ALTERNATIVES = 8;

const alternativeInput = ingredientSourceSchema.and(preparation);
const ingredient = ingredientSourceSchema
  .and(quantity.extend({ note: note.optional() }))
  .refine((line) => line.amount != null || !unitNeedsAmount(line.unit), {
    path: ["amount"],
    message: "Enter an amount for this unit",
  });
const alternatives = alternativeInput.array();
/** The editor can load a previously saved ingredient with more alternatives than a new write allows. */
export const cocktailIngredientDraftSchema = ingredient.and(
  z.object({ alternatives: alternatives.default([]) }),
);
export const cocktailIngredientInputSchema = ingredient.and(
  z.object({ alternatives: alternatives.max(MAX_INGREDIENT_ALTERNATIVES).default([]) }),
);
export type CocktailIngredientInput = z.infer<typeof cocktailIngredientInputSchema>;

const resolvedSource = z.object({
  ...refs,
  id: idSchema,
  position: z.number().int().nonnegative(),
  note: z.string().nullable(),
  name: z.string(),
  category_path: z.array(z.object({ id: idSchema, name: z.string() })),
  abv: z.number(),
  /** Owned products for a category source (it or its sub-categories); empty for other sources. */
  matching_bottles: matchingBottleSchema.array(),
});
export const cocktailIngredientSchema = resolvedSource.extend({
  amount: z.number().nullable(),
  unit: unitSchema,
  optional: z.boolean(),
  preparation_only: z.boolean().default(false),
  alternatives: resolvedSource.array(),
});
export type CocktailIngredient = z.infer<typeof cocktailIngredientSchema>;
