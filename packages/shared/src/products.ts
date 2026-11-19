import { z } from "zod";
import { DESCRIPTION_MAX } from "./categories.ts";
import { idSchema } from "./id.ts";
import { booleanQuerySchema, paginationQuerySchema } from "./pagination.ts";
import { optionalText } from "./text.ts";

export const PRODUCT_NAME_MAX = 200;
export const PRODUCT_TEXT_MAX = 100;
export const VINTAGE_MIN = 1800;
export const VINTAGE_MAX = 2200;
export const AGE_YEARS_MAX = 100;

/** A real bottle, whether it is in the bar or was only tasted. */
export const productSchema = z.object({
  id: idSchema,
  name: z.string(),
  category_id: idSchema,
  /** Name of the category, for lists. */
  category_name: z.string(),
  producer: z.string().nullable(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  /** Percent, 0–100. */
  abv: z.number().nullable(),
  vintage: z.number().int().nullable(),
  age_years: z.number().int().nullable(),
  description: z.string().nullable(),
  /** The bottle is in the bar right now. */
  in_bar: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Product = z.infer<typeof productSchema>;

const fields = {
  name: z.string().trim().min(1).max(PRODUCT_NAME_MAX),
  category_id: idSchema,
  producer: optionalText(PRODUCT_TEXT_MAX),
  country: optionalText(PRODUCT_TEXT_MAX),
  region: optionalText(PRODUCT_TEXT_MAX),
  abv: z.number().min(0).max(100).nullable(),
  vintage: z.number().int().min(VINTAGE_MIN).max(VINTAGE_MAX).nullable(),
  age_years: z.number().int().min(0).max(AGE_YEARS_MAX).nullable(),
  description: optionalText(DESCRIPTION_MAX),
  in_bar: z.boolean(),
};

/** `POST /products` */
export const createProductSchema = z
  .object(fields)
  .partial()
  .required({ name: true, category_id: true });
export type CreateProduct = z.infer<typeof createProductSchema>;

/** `PATCH /products/:id`: only the fields sent change. */
export const updateProductSchema = z
  .object(fields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Send at least one field to change");
export type UpdateProduct = z.infer<typeof updateProductSchema>;

/** `PATCH /products/:id/in-bar` */
export const setProductInBarSchema = z.object({ in_bar: z.boolean() });

/** `GET /products`: a page sorted by name. */
export const listProductsQuerySchema = paginationQuerySchema.extend({
  /** Matches anywhere in the name or the producer, ignoring case. */
  q: z.string().trim().min(1).max(PRODUCT_NAME_MAX).optional(),
  /** The category or any of its sub-categories. */
  category_id: idSchema.optional(),
  in_bar: booleanQuerySchema.optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
