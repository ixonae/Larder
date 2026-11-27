import { z } from "zod";
import { DESCRIPTION_MAX } from "./categories.ts";
import { cocktailIngredientInputSchema, cocktailIngredientSchema } from "./cocktail-ingredients.ts";
import { otherRatingSchema, ratingSummarySchema } from "./feedback.ts";
import { idSchema } from "./id.ts";
import { missingIngredientSchema } from "./makeability.ts";
import { booleanQuerySchema, listOf, pageSchema, paginationQuerySchema } from "./pagination.ts";
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

export const cocktailSchema = fields.extend(ratingSummarySchema.shape).extend({
  id: idSchema,
  image_id: idSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  computed: computedCocktailSchema,
  /** Whether the current user favourited this cocktail. */
  is_favourite: z.boolean(),
  /** Required lines the bar cannot pour right now; empty when the cocktail can be made. */
  missing: missingIngredientSchema.array(),
});
export type Cocktail = z.infer<typeof cocktailSchema>;
export const cocktailPageSchema = pageSchema(cocktailSchema);

export const cocktailStepInputSchema = z.object({
  text: z.string().trim().min(1).max(DESCRIPTION_MAX),
});
const stepSchema = cocktailStepInputSchema.extend({
  id: idSchema,
  position: z.number().int().nonnegative(),
});

export const tagSchema: typeof namedReferenceSchema = namedReferenceSchema;
export type Tag = z.infer<typeof tagSchema>;
export const tagPageSchema = pageSchema(tagSchema);

export const listTagsQuerySchema = paginationQuerySchema.extend({ q: nameSchema.optional() });
export type ListTagsQuery = z.infer<typeof listTagsQuerySchema>;

export const cocktailDetailSchema = cocktailSchema.extend({
  variant_of: namedReferenceSchema.nullable(),
  variants: namedReferenceSchema.array(),
  ingredients: cocktailIngredientSchema.array(),
  steps: stepSchema.array(),
  tools: namedReferenceSchema.array(),
  tags: tagSchema.array(),
  /** Public ratings by other users, newest first. */
  other_ratings: otherRatingSchema.array(),
});
export type CocktailDetail = z.infer<typeof cocktailDetailSchema>;

export const RECIPE_LIMITS = { ingredients: 64, steps: 256, tools: 32, tags: 32 } as const;

const recipeLists = z
  .object({
    ingredients: cocktailIngredientInputSchema.array().max(RECIPE_LIMITS.ingredients),
    steps: cocktailStepInputSchema.array().max(RECIPE_LIMITS.steps),
    tool_ids: idSchema.array().max(RECIPE_LIMITS.tools),
    tags: nameSchema.array().max(RECIPE_LIMITS.tags),
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

export const COCKTAIL_SORTS = ["name", "rating"] as const;
export type CocktailSort = (typeof COCKTAIL_SORTS)[number];

export const listCocktailsQuerySchema = paginationQuerySchema.extend({
  /** `rating`: highest average first, unrated last, then by name. */
  sort: z.enum(COCKTAIL_SORTS).default("name"),
  q: nameSchema.optional(),
  /** Candidates for this cocktail's parent, excluding the cocktail and all its variants. */
  parent_for: idSchema.optional(),
  /** Any of these methods. */
  method: listOf(methodSchema).optional(),
  /**
   * Category IDs. Uses an alcoholic ingredient (spirit, liqueur, wine or beer) in each of these
   * categories or their descendants: with several, every one of them.
   */
  alcohol: listOf(idSchema).optional(),
  /** Like `alcohol`, for mixers, juices, syrups and bitters. */
  mixer: listOf(idSchema).optional(),
  /** `true` lists only the caller's favourites. */
  favourite: booleanQuerySchema.optional(),
  /** Tag IDs from GET /tags: carrying every one of them. */
  tag: listOf(idSchema).optional(),
  /** Exactly this many required lines missing: 0 lists what the bar can make now. */
  missing: z
    .string()
    .regex(/^\d+$/, "Enter a whole number")
    .transform(Number)
    .pipe(z.number().safe())
    .optional(),
});
export type ListCocktailsQuery = z.infer<typeof listCocktailsQuerySchema>;

export const cocktailDetailQuerySchema = z.object({
  servings: z.coerce.number<string>().pipe(servingsSchema).optional(),
});
