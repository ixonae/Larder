import { z } from "zod";
import { idSchema } from "./id.ts";
import { booleanQuerySchema, paginationQuerySchema } from "./pagination.ts";

export const PANTRY_INGREDIENT_NAME_MAX = 100;

/** A supply the bar keeps that is not a bottle (Lemon, Egg, Salt…), grouped under a category. */
export const pantryIngredientSchema = z.object({
  id: idSchema,
  name: z.string(),
  category_id: idSchema,
  category_name: z.string(),
  /** There right now; toggled as it runs out and gets restocked. */
  in_stock: z.boolean(),
  /** A staple that is always there (water, ice…), whatever `in_stock` says. */
  always_available: z.boolean(),
  image_id: idSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type PantryIngredient = z.infer<typeof pantryIngredientSchema>;

const fields = {
  name: z.string().trim().min(1).max(PANTRY_INGREDIENT_NAME_MAX),
  category_id: idSchema,
  in_stock: z.boolean(),
  always_available: z.boolean(),
};

/** `POST /pantry-ingredients`: both flags default to `false`. */
export const createPantryIngredientSchema = z
  .object(fields)
  .partial()
  .required({ name: true, category_id: true });
export type CreatePantryIngredient = z.infer<typeof createPantryIngredientSchema>;

/** `PATCH /pantry-ingredients/:id`: only the fields sent change. */
export const updatePantryIngredientSchema = z
  .object(fields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Send at least one field to change");
export type UpdatePantryIngredient = z.infer<typeof updatePantryIngredientSchema>;

/** `GET /pantry-ingredients`: a page sorted by name. */
export const listPantryIngredientsQuerySchema = paginationQuerySchema.extend({
  /** Matches anywhere in the name, ignoring case. */
  q: z.string().trim().min(1).max(PANTRY_INGREDIENT_NAME_MAX).optional(),
  /** The category or any of its sub-categories. */
  category_id: idSchema.optional(),
  /** `true`: in stock or always available; `false`: neither. */
  available: booleanQuerySchema.optional(),
});
export type ListPantryIngredientsQuery = z.infer<typeof listPantryIngredientsQuerySchema>;
