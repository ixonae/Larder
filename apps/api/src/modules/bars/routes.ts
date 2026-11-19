import { Hono } from "hono";
import { barAccess } from "../../middleware/context.ts";
import type { AppEnv } from "../../types.ts";

/** Routes under `/api/bars/:barId`. Every bar-scoped module is mounted here, behind `barAccess`. */
export const barRoutes = new Hono<AppEnv>()
  .use(barAccess)
  // barAccess has already loaded the bar and the member's role through the bars service.
  .get("/", (c) => c.json(c.var.bar));
