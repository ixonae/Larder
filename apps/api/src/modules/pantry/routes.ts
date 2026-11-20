import {
  createPantryIngredientSchema,
  listPantryIngredientsQuerySchema,
  updatePantryIngredientSchema,
} from "@larder/shared";
import { Hono } from "hono";
import { requireRole } from "../../middleware/context.ts";
import { validate } from "../../middleware/validate.ts";
import type { AppEnv } from "../../types.ts";
import {
  createPantryIngredient,
  deletePantryIngredient,
  getPantryIngredient,
  listPantryIngredients,
  updatePantryIngredient,
} from "./service.ts";

/** `/api/bars/:barId/pantry-ingredients`. Members read; editors and owners write. */
export const pantryRoutes = new Hono<AppEnv>()
  .get("/", validate("query", listPantryIngredientsQuerySchema), (c) =>
    c.json(listPantryIngredients(c.var.ctx, c.req.valid("query"))),
  )
  .get("/:id", (c) => c.json(getPantryIngredient(c.var.ctx, c.req.param("id"))))
  .post("/", requireRole("editor"), validate("json", createPantryIngredientSchema), (c) =>
    c.json(createPantryIngredient(c.var.ctx, c.req.valid("json")), 201),
  )
  .patch("/:id", requireRole("editor"), validate("json", updatePantryIngredientSchema), (c) =>
    c.json(updatePantryIngredient(c.var.ctx, c.req.param("id"), c.req.valid("json"))),
  )
  .delete("/:id", requireRole("editor"), async (c) => {
    await deletePantryIngredient(c.var.ctx, c.req.param("id"));
    return c.body(null, 204);
  });
