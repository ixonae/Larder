import {
  createCocktailSchema,
  listCocktailsQuerySchema,
  listTagsQuerySchema,
  updateCocktailSchema,
} from "@larder/shared";
import { Hono } from "hono";
import { requireRole } from "../../middleware/context.ts";
import { validate } from "../../middleware/validate.ts";
import type { AppEnv } from "../../types.ts";
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
  .get("/:id", (c) => c.json(getCocktail(c.var.ctx, c.req.param("id"))))
  .post("/", requireRole("editor"), validate("json", createCocktailSchema), (c) =>
    c.json(createCocktail(c.var.ctx, c.req.valid("json")), 201),
  )
  .patch("/:id", requireRole("editor"), validate("json", updateCocktailSchema), (c) =>
    c.json(updateCocktail(c.var.ctx, c.req.param("id"), c.req.valid("json"))),
  )
  .delete("/:id", requireRole("editor"), async (c) => {
    await deleteCocktail(c.var.ctx, c.req.param("id"));
    return c.body(null, 204);
  });

/** `/api/bars/:barId/tags`. Tags are created through cocktail writes. */
export const tagRoutes = new Hono<AppEnv>().get("/", validate("query", listTagsQuerySchema), (c) =>
  c.json(listTags(c.var.ctx, c.req.valid("query"))),
);
