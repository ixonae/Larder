import {
  createProductSchema,
  createPurchaseSchema,
  finishProductSchema,
  listProductsQuerySchema,
  setProductStatusSchema,
  updateProductSchema,
  updatePurchaseSchema,
} from "@larder/shared";
import { Hono } from "hono";
import { requireRole } from "../../middleware/context.ts";
import { validate } from "../../middleware/validate.ts";
import type { AppEnv } from "../../types.ts";
import {
  createPurchases,
  deletePurchase,
  finishProduct,
  listPurchases,
  updatePurchase,
} from "./purchases-service.ts";
import {
  addFavourite,
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  removeFavourite,
  updateProduct,
} from "./service.ts";

/** `/api/bars/:barId/products`. Members read; editors and owners write. */
export const productRoutes = new Hono<AppEnv>()
  .get("/", validate("query", listProductsQuerySchema), (c) =>
    c.json(listProducts(c.var.ctx, c.req.valid("query"))),
  )
  .get("/:id", (c) => c.json(getProduct(c.var.ctx, c.req.param("id"))))
  .post("/", requireRole("editor"), validate("json", createProductSchema), (c) =>
    c.json(createProduct(c.var.ctx, c.req.valid("json")), 201),
  )
  .patch("/:id", requireRole("editor"), validate("json", updateProductSchema), (c) =>
    c.json(updateProduct(c.var.ctx, c.req.param("id"), c.req.valid("json"))),
  )
  .patch("/:id/status", requireRole("editor"), validate("json", setProductStatusSchema), (c) =>
    // Setting the status by hand: an update of that single field; purchases are left untouched.
    c.json(updateProduct(c.var.ctx, c.req.param("id"), c.req.valid("json"))),
  )
  .post("/:id/finish", requireRole("editor"), validate("json", finishProductSchema), (c) =>
    c.json(finishProduct(c.var.ctx, c.req.param("id"), c.req.valid("json"))),
  )
  // Favourites are personal: viewers may set their own.
  .put("/:id/favourite", (c) => {
    addFavourite(c.var.ctx, c.req.param("id"));
    return c.body(null, 204);
  })
  .delete("/:id/favourite", (c) => {
    removeFavourite(c.var.ctx, c.req.param("id"));
    return c.body(null, 204);
  })
  .get("/:id/purchases", (c) => c.json(listPurchases(c.var.ctx, c.req.param("id"))))
  .post("/:id/purchases", requireRole("editor"), validate("json", createPurchaseSchema), (c) =>
    c.json(createPurchases(c.var.ctx, c.req.param("id"), c.req.valid("json")), 201),
  )
  .patch(
    "/:id/purchases/:purchaseId",
    requireRole("editor"),
    validate("json", updatePurchaseSchema),
    (c) =>
      c.json(
        updatePurchase(
          c.var.ctx,
          c.req.param("id"),
          c.req.param("purchaseId"),
          c.req.valid("json"),
        ),
      ),
  )
  .delete("/:id/purchases/:purchaseId", requireRole("editor"), (c) => {
    deletePurchase(c.var.ctx, c.req.param("id"), c.req.param("purchaseId"));
    return c.body(null, 204);
  })
  .delete("/:id", requireRole("editor"), async (c) => {
    await deleteProduct(c.var.ctx, c.req.param("id"));
    return c.body(null, 204);
  });
