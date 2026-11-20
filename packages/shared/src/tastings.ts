import { z } from "zod";
import { DESCRIPTION_MAX } from "./categories.ts";
import { ratingInputSchema, visibilitySchema } from "./feedback.ts";
import { idSchema } from "./id.ts";
import { booleanQuerySchema, pageSchema, paginationQuerySchema } from "./pagination.ts";
import { PRODUCT_TEXT_MAX, productStatusSchema } from "./products.ts";
import { authorSchema } from "./tenancy.ts";
import { optionalText } from "./text.ts";
import { isoDateSchema } from "./time.ts";

export const TASTING_SCORE_MIN = 1;
export const TASTING_SCORE_MAX = 5;

/** The same 1–5 score as a cocktail rating. */
const scoreSchema = ratingInputSchema.shape.score;

/** The bottle a tasting is about, as the journal shows it. */
export const tastingProductSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** The picture (`imageUrl(image_id)`, `thumbnailUrl(image_id)`). */
  image_id: idSchema.nullable(),
  category_id: idSchema,
  category_name: z.string(),
  status: productStatusSchema.nullable(),
});
export type TastingProduct = z.infer<typeof tastingProductSchema>;

/** One entry of the tasting journal: someone tasted a bottle on a day. */
export const tastingSchema = z.object({
  id: idSchema,
  product_id: idSchema,
  tasted_on: isoDateSchema,
  /** 1–5, or null when the taster gave no score. */
  score: scoreSchema.nullable(),
  notes: z.string().nullable(),
  location: z.string().nullable(),
  is_private: z.boolean(),
  author: authorSchema,
  product: tastingProductSchema,
  /**
   * Whether the caller may delete it: the author while they can write in the bar, or the bar's
   * owner once the author no longer can.
   */
  can_delete: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Tasting = z.infer<typeof tastingSchema>;
export const tastingPageSchema = pageSchema(tastingSchema);

const fields = {
  tasted_on: isoDateSchema,
  score: scoreSchema.nullable(),
  notes: optionalText(DESCRIPTION_MAX),
  location: optionalText(PRODUCT_TEXT_MAX),
  is_private: z.boolean(),
};

/** `POST /products/:id/tastings`: only the day is required. */
export const createTastingSchema = z.object(fields).partial().required({ tasted_on: true });
/** What a form sends. */
export type CreateTastingInput = z.input<typeof createTastingSchema>;
export type CreateTasting = z.infer<typeof createTastingSchema>;

/** `PATCH /tastings/:id`: only the fields sent change. */
export const updateTastingSchema = z
  .object(fields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Send at least one field to change");
export type UpdateTasting = z.infer<typeof updateTastingSchema>;

const scoreQuerySchema = z.coerce
  .number<string>()
  .int()
  .min(TASTING_SCORE_MIN)
  .max(TASTING_SCORE_MAX);

/** `GET /tastings`: newest first (`tasted_on`, then id). */
export const listTastingsQuerySchema = paginationQuerySchema.extend({
  /** Bottles in this category or any of its sub-categories. */
  category_id: idSchema.optional(),
  product_id: idSchema.optional(),
  /** Scored at least / at most this; unscored tastings never match a score filter. */
  score_min: scoreQuerySchema.optional(),
  score_max: scoreQuerySchema.optional(),
  /** Tasted on or after / on or before this day. */
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  /** `true` lists only the caller's own tastings. */
  mine: booleanQuerySchema.optional(),
  visibility: visibilitySchema.optional(),
});
export type ListTastingsQuery = z.infer<typeof listTastingsQuerySchema>;

export const listProductTastingsQuerySchema = listTastingsQuerySchema.omit({
  category_id: true,
  product_id: true,
});
export type ListProductTastingsQuery = z.infer<typeof listProductTastingsQuerySchema>;
