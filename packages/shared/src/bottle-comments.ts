import type { z } from "zod";
import { commentInputSchema, commentSchema, visibilitySchema } from "./feedback.ts";
import { idSchema } from "./id.ts";
import { pageSchema, paginationQuerySchema } from "./pagination.ts";

/**
 * A public or private comment in a bottle's thread, with the same visibility as a cocktail comment.
 */
export const bottleCommentSchema = commentSchema
  .omit({ cocktail_id: true })
  .extend({ product_id: idSchema });
export type BottleComment = z.infer<typeof bottleCommentSchema>;
export const bottleCommentPageSchema = pageSchema(bottleCommentSchema);

/** `POST /products/:id/comments`. */
export const bottleCommentInputSchema = commentInputSchema;
export type BottleCommentInput = z.input<typeof bottleCommentInputSchema>;

export const listBottleCommentsQuerySchema = paginationQuerySchema.extend({
  visibility: visibilitySchema.optional(),
});
export type ListBottleCommentsQuery = z.infer<typeof listBottleCommentsQuerySchema>;
