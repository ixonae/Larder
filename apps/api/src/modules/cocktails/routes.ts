import {
  cocktailDetailQuerySchema,
  commentInputSchema,
  createCocktailSchema,
  listCocktailsQuerySchema,
  listTagsQuerySchema,
  paginationQuerySchema,
  ratingInputSchema,
  updateCocktailSchema,
  updateCommentSchema,
} from "@larder/shared";
import { Hono } from "hono";
import { requireRole } from "../../middleware/context.ts";
import { validate } from "../../middleware/validate.ts";
import type { AppEnv } from "../../types.ts";
import {
  addComment,
  editComment,
  listComments,
  putRating,
  removeComment,
  removeRating,
  setFavourite,
} from "./feedback.ts";
import {
  createCocktail,
  deleteCocktail,
  getCocktail,
  listCocktails,
  listTags,
  updateCocktail,
} from "./service.ts";

/** `/api/bars/:barId/cocktails`. Members read; editors and owners write. */
export const cocktailRoutes = new Hono<AppEnv>()
  .get("/", validate("query", listCocktailsQuerySchema), (c) =>
    c.json(listCocktails(c.var.ctx, c.req.valid("query"))),
  )
  .get("/:id", validate("query", cocktailDetailQuerySchema), (c) =>
    c.json(getCocktail(c.var.ctx, c.req.param("id"), c.req.valid("query").servings)),
  )
  .post("/", requireRole("editor"), validate("json", createCocktailSchema), (c) =>
    c.json(createCocktail(c.var.ctx, c.req.valid("json")), 201),
  )
  .patch("/:id", requireRole("editor"), validate("json", updateCocktailSchema), (c) =>
    c.json(updateCocktail(c.var.ctx, c.req.param("id"), c.req.valid("json"))),
  )
  .put("/:id/rating", validate("json", ratingInputSchema), (c) =>
    c.json(putRating(c.var.ctx, c.req.param("id"), c.req.valid("json"))),
  )
  .delete("/:id/rating", (c) => {
    removeRating(c.var.ctx, c.req.param("id"));
    return c.body(null, 204);
  })
  .put("/:id/favourite", (c) => {
    setFavourite(c.var.ctx, c.req.param("id"), true);
    return c.body(null, 204);
  })
  .delete("/:id/favourite", (c) => {
    setFavourite(c.var.ctx, c.req.param("id"), false);
    return c.body(null, 204);
  })
  .get("/:id/comments", validate("query", paginationQuerySchema), (c) =>
    c.json(listComments(c.var.ctx, c.req.param("id"), c.req.valid("query"))),
  )
  .post("/:id/comments", validate("json", commentInputSchema), (c) =>
    c.json(addComment(c.var.ctx, c.req.param("id"), c.req.valid("json")), 201),
  )
  .patch("/:id/comments/:commentId", validate("json", updateCommentSchema), (c) =>
    c.json(
      editComment(c.var.ctx, c.req.param("id"), c.req.param("commentId"), c.req.valid("json")),
    ),
  )
  .delete("/:id/comments/:commentId", (c) => {
    removeComment(c.var.ctx, c.req.param("id"), c.req.param("commentId"));
    return c.body(null, 204);
  })
  .delete("/:id", requireRole("editor"), async (c) => {
    await deleteCocktail(c.var.ctx, c.req.param("id"));
    return c.body(null, 204);
  });

/** `/api/bars/:barId/tags`. Tags are created through cocktail writes. */
export const tagRoutes = new Hono<AppEnv>().get("/", validate("query", listTagsQuerySchema), (c) =>
  c.json(listTags(c.var.ctx, c.req.valid("query"))),
);
