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
export type CocktailMethod = z.infer<typeof methodSchema>;

const namedReferenceSchema = z.object({ id: idSchema, name: z.string() });
const computedCocktailSchema = z.object({
  /** Null when the measured volume exceeds the numeric range. */
  volume_ml: z.number().nonnegative().nullable(),
  /** Estimated percent after dilution. */
  abv: z.number().min(0).max(100),
  spirits: namedReferenceSchema.array(),
  /** Preferred ingredient names in recipe order, without preparation-only lines. */
  ingredients: z.string().array(),
});
export type ComputedCocktail = z.infer<typeof computedCocktailSchema>;

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
  computed: computedCocktailSchema,
});
export type Cocktail = z.infer<typeof cocktailSchema>;
export const cocktailPageSchema = pageSchema(cocktailSchema);

const stepInputSchema = z.object({ text: z.string().trim().min(1).max(DESCRIPTION_MAX) });
const stepSchema = stepInputSchema.extend({
  id: idSchema,
  position: z.number().int().nonnegative(),
});

export const tagSchema = namedReferenceSchema;
export type Tag = z.infer<typeof tagSchema>;
export const tagPageSchema = pageSchema(tagSchema);

export const listTagsQuerySchema = paginationQuerySchema.extend({ q: nameSchema.optional() });
export type ListTagsQuery = z.infer<typeof listTagsQuerySchema>;

export const cocktailDetailSchema = cocktailSchema.extend({
  ingredients: cocktailIngredientSchema.array(),
  steps: stepSchema.array(),
  tools: namedReferenceSchema.array(),
  tags: tagSchema.array(),
});
export type CocktailDetail = z.infer<typeof cocktailDetailSchema>;

const recipeLists = z
  .object({
    ingredients: cocktailIngredientInputSchema.array(),
    steps: stepInputSchema.array(),
    tool_ids: idSchema.array(),
    tags: nameSchema.array(),
  })
  .partial();
export type CocktailRecipeLists = z.infer<typeof recipeLists>;

const recipeFields = fields.extend(recipeLists.shape);
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
  /** Category ID. Matches spirit ingredients in that category or its descendants. */
  spirit: idSchema.optional(),
  /** Tag ID from GET /tags. */
  tag: idSchema.optional(),
});
export type ListCocktailsQuery = z.infer<typeof listCocktailsQuerySchema>;

export const cocktailDetailQuerySchema = z.object({
  servings: z.coerce.number<string>().pipe(servingsSchema).optional(),
});
