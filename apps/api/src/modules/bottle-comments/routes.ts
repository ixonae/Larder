import {
  bottleCommentInputSchema,
  listBottleCommentsQuerySchema,
  updateCommentSchema,
} from "@larder/shared";
import { Hono } from "hono";
import { requireRole } from "../../middleware/context.ts";
import { validate } from "../../middleware/validate.ts";
import type { AppEnv } from "../../types.ts";
import {
  addBottleComment,
  editBottleComment,
  listBottleComments,
  removeBottleComment,
} from "./service.ts";

/**
 * `/api/bars/:barId/products/:id/comments`: members read public and their own private comments.
 * Editors and owners post, and only a comment's author changes it.
 */
export const bottleCommentRoutes = new Hono<AppEnv>()
  .get("/:id/comments", validate("query", listBottleCommentsQuerySchema), (c) =>
    c.json(listBottleComments(c.var.ctx, c.req.param("id"), c.req.valid("query"))),
  )
  .post("/:id/comments", requireRole("editor"), validate("json", bottleCommentInputSchema), (c) =>
    c.json(addBottleComment(c.var.ctx, c.req.param("id"), c.req.valid("json")), 201),
  )
  .patch(
    "/:id/comments/:commentId",
    requireRole("editor"),
    validate("json", updateCommentSchema),
    (c) =>
      c.json(
        editBottleComment(
          c.var.ctx,
          c.req.param("id"),
          c.req.param("commentId"),
          c.req.valid("json"),
        ),
      ),
  )
  .delete("/:id/comments/:commentId", requireRole("editor"), (c) => {
    removeBottleComment(c.var.ctx, c.req.param("id"), c.req.param("commentId"));
    return c.body(null, 204);
  });
