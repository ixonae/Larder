import { Hono } from "hono";
import { barAccess } from "../../middleware/context.ts";
import type { AppEnv } from "../../types.ts";
import { categoryRoutes } from "../categories/routes.ts";
import { cocktailRoutes, tagRoutes } from "../cocktails/routes.ts";
import { entityImageRoutes } from "../images/routes.ts";
import { pantryRoutes } from "../pantry/routes.ts";
import { productRoutes } from "../products/routes.ts";
import { utensilRoutes } from "../utensils/routes.ts";

/** Routes under `/api/bars/:barId`. Every bar-scoped module is mounted here, behind `barAccess`. */
export const barRoutes = new Hono<AppEnv>()
  .use(barAccess)
  // barAccess has already loaded the bar and the member's role through the bars service.
  .get("/", (c) => c.json(c.var.bar))
  .route("/categories", categoryRoutes)
  .route("/categories", entityImageRoutes("categories"))
  .route("/products", productRoutes)
  .route("/products", entityImageRoutes("products"))
  .route("/pantry-ingredients", pantryRoutes)
  .route("/utensils", utensilRoutes)
  .route("/utensils", entityImageRoutes("utensils"))
  .route("/cocktails", cocktailRoutes)
  .route("/cocktails", entityImageRoutes("cocktails"))
  .route("/tags", tagRoutes);
