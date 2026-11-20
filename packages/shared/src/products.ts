import { z } from "zod";
import { DESCRIPTION_MAX } from "./categories.ts";
import { countrySchema } from "./countries.ts";
import { idSchema } from "./id.ts";
import { booleanQuerySchema, listOf, paginationQuerySchema } from "./pagination.ts";
import { optionalText } from "./text.ts";
import { isoDateSchema } from "./time.ts";

export const PRODUCT_NAME_MAX = 200;
export const PRODUCT_TEXT_MAX = 100;
export const VINTAGE_MIN = 1800;
export const VINTAGE_MAX = 2200;
export const AGE_YEARS_MAX = 100;

/**
 * Where a bottle stands, or null for a bottle that is only in the catalogue. `owned` is the only
 * status that counts as "in the bar"; purchases move a bottle between `owned` and `finished`, and
 * every status can also be set by hand. `want_to_buy` means you want to own it, `want_to_try` that
 * you want to taste it without necessarily buying it, `tasted` that you tasted it and don't own it.
 */
export const PRODUCT_STATUSES = [
  "owned",
  "finished",
  "want_to_buy",
  "want_to_try",
  "tasted",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const productStatusSchema = z.enum(PRODUCT_STATUSES);
/** `?status=none` matches bottles that have no status. */
export const NO_STATUS = "none";

/** The bottle's purchase records, summed up. */
export const productStockSchema = z.object({
  /** Physical bottles bought and not finished yet. */
  open_count: z.number().int(),
  total_count: z.number().int(),
  last_bought_on: isoDateSchema.nullable(),
  last_finished_on: isoDateSchema.nullable(),
});
export type ProductStock = z.infer<typeof productStockSchema>;

/** Summary of tastings visible to the caller. Unscored tastings count but are not averaged. */
export const tastingSummarySchema = z.object({
  count: z.number().int().nonnegative(),
  /** Average of the scored tastings, one decimal; null when none has a score. */
  avg_score: z.number().nullable(),
  last_tasted_on: isoDateSchema.nullable(),
});
export type TastingSummary = z.infer<typeof tastingSummarySchema>;

/** A real bottle, whether it is in the bar, finished, wanted or only tasted. */
export const productSchema = z.object({
  id: idSchema,
  name: z.string(),
  category_id: idSchema,
  /** Name of the category, for lists. */
  category_name: z.string(),
  producer: z.string().nullable(),
  /** ISO 3166-1 alpha-2 code; the more precise place ("Scotland", "Kentucky") goes in `region`. */
  country: countrySchema.nullable(),
  region: z.string().nullable(),
  /** Percent, 0–100. */
  abv: z.number().nullable(),
  vintage: z.number().int().nullable(),
  age_years: z.number().int().nullable(),
  description: z.string().nullable(),
  /** The picture (`imageUrl(image_id)`), set through `PUT /:id/image`. */
  image_id: idSchema.nullable(),
  /** `owned` means the bottle is in the bar right now; null when it has no status. */
  status: productStatusSchema.nullable(),
  stock: productStockSchema,
  /** The bottle's overall rating is `tasting_summary.avg_score`. */
  tasting_summary: tastingSummarySchema,
  /** Whether the current user favourited this bottle; favourites are personal. */
  is_favourite: z.boolean(),
  /** Bottle comments visible to the caller. */
  comment_count: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Product = z.infer<typeof productSchema>;

const fields = {
  name: z.string().trim().min(1).max(PRODUCT_NAME_MAX),
  category_id: idSchema,
  producer: optionalText(PRODUCT_TEXT_MAX),
  country: countrySchema.nullable(),
  region: optionalText(PRODUCT_TEXT_MAX),
  abv: z.number().min(0).max(100).nullable(),
  vintage: z.number().int().min(VINTAGE_MIN).max(VINTAGE_MAX).nullable(),
  age_years: z.number().int().min(0).max(AGE_YEARS_MAX).nullable(),
  description: optionalText(DESCRIPTION_MAX),
  status: productStatusSchema.nullable(),
};

/** `POST /products`: a bottle created without a `status` has none. */
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

/** `PATCH /products/:id/status`: sets any status (or null) by hand; purchases are left untouched. */
export const setProductStatusSchema = z.object({ status: productStatusSchema.nullable() });
export type SetProductStatus = z.infer<typeof setProductStatusSchema>;

/** `GET /products`: a page sorted by name. */
export const listProductsQuerySchema = paginationQuerySchema.extend({
  /** Matches anywhere in the name or the producer, ignoring case. */
  q: z.string().trim().min(1).max(PRODUCT_NAME_MAX).optional(),
  /** The category or any of its sub-categories. */
  category_id: idSchema.optional(),
  /** Any of these statuses, `none` for no status: `?status=owned,none`. */
  status: listOf(z.enum([...PRODUCT_STATUSES, NO_STATUS])).optional(),
  /** Bottles from this country. */
  country: countrySchema.optional(),
  /** `true` lists only the caller's favourites. */
  favourite: booleanQuerySchema.optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
