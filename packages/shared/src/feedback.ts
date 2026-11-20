import { z } from "zod";
import { idSchema } from "./id.ts";
import { authorSchema } from "./tenancy.ts";

export const COMMENT_MAX = 2000;

export const visibilitySchema = z.enum(["public", "private"]);
export type Visibility = z.infer<typeof visibilitySchema>;

const scoreSchema = z.number().int().min(1).max(5);

export const ratingInputSchema = z.object({ score: scoreSchema });
export type RatingInput = z.infer<typeof ratingInputSchema>;

export const ratingSchema = z.object({ score: scoreSchema, updated_at: z.string() });
export type Rating = z.infer<typeof ratingSchema>;

/** Another member's rating of a cocktail. */
export const otherRatingSchema = ratingSchema.extend({ user: authorSchema });
export type OtherRating = z.infer<typeof otherRatingSchema>;

/** The rating summary every cocktail carries; `avg_rating` counts every rating. */
export const ratingSummarySchema = z.object({
  my_rating: ratingSchema.nullable(),
  avg_rating: z.number().nullable(),
  rating_count: z.number().int().nonnegative(),
});
export type RatingSummary = z.infer<typeof ratingSummarySchema>;

/** A comment's text: trimmed, 1 to `COMMENT_MAX` characters. */
export const commentBodySchema = z.string().trim().min(1).max(COMMENT_MAX);

export const commentInputSchema = z.object({
  body: commentBodySchema,
  is_private: z.boolean().default(false),
});
/** What a form sends: `is_private` may be left out. */
export type CommentInput = z.input<typeof commentInputSchema>;
/** What the server works with once the defaults are applied. */
export type NewComment = z.infer<typeof commentInputSchema>;

export const updateCommentSchema = z
  .object({ body: commentBodySchema, is_private: z.boolean() })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Send at least one field to change");
export type UpdateComment = z.infer<typeof updateCommentSchema>;

export const commentSchema = z.object({
  id: idSchema,
  cocktail_id: idSchema,
  body: z.string(),
  is_private: z.boolean(),
  author: authorSchema,
  created_at: z.string(),
  updated_at: z.string(),
  /** True when `updated_at` is later than `created_at`. */
  edited: z.boolean(),
});
export type Comment = z.infer<typeof commentSchema>;
