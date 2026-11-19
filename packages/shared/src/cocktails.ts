import { z } from "zod";
import { DESCRIPTION_MAX } from "./categories.ts";
import { cocktailIngredientInputSchema, cocktailIngredientSchema } from "./cocktail-ingredients.ts";
import { idSchema } from "./id.ts";
import { pageSchema, paginationQuerySchema } from "./pagination.ts";
import { optionalText } from "./text.ts";

export const COCKTAIL_METHODS = [
  "shaken",
  "stirred",
  "built",
  "blended",
  "thrown",
  "other",
] as const;
export const COCKTAIL_ICE = ["none", "cubes", "crushed", "large_cube", "other"] as const;
const methodSchema = z.enum(COCKTAIL_METHODS);
const iceSchema = z.enum(COCKTAIL_ICE);
const nameSchema = z.string().trim().min(1).max(100);
const servingsSchema = z.number().int().positive().safe();

const fields = z.object({
  name: nameSchema,
  method: methodSchema,
  ice: iceSchema,
  glass_id: idSchema.nullable(),
  servings: servingsSchema,
  variant_of_id: idSchema.nullable(),
  description: optionalText(DESCRIPTION_MAX),
  garnish: optionalText(DESCRIPTION_MAX),
  serving_notes: optionalText(DESCRIPTION_MAX),
  source: optionalText(DESCRIPTION_MAX),
  notes: optionalText(DESCRIPTION_MAX),
  variant_note: optionalText(DESCRIPTION_MAX),
});

export const cocktailSchema = fields.extend({
  id: idSchema,
  image_id: idSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Cocktail = z.infer<typeof cocktailSchema>;
export const cocktailPageSchema = pageSchema(cocktailSchema);

export const cocktailDetailSchema = cocktailSchema.extend({
  ingredients: cocktailIngredientSchema.array(),
});
export type CocktailDetail = z.infer<typeof cocktailDetailSchema>;

const recipeFields = fields.extend({ ingredients: cocktailIngredientInputSchema.array() });
export const createCocktailSchema = recipeFields.partial().required({ name: true, method: true });
export type CreateCocktail = z.infer<typeof createCocktailSchema>;
export const updateCocktailSchema = recipeFields
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Send at least one field to change");
export type UpdateCocktail = z.infer<typeof updateCocktailSchema>;

export const listCocktailsQuerySchema = paginationQuerySchema.extend({
  q: nameSchema.optional(),
  method: methodSchema.optional(),
  glass_id: idSchema.optional(),
});
export type ListCocktailsQuery = z.infer<typeof listCocktailsQuerySchema>;
