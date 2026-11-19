import type { BarSummary } from "@larder/shared";
import { Hono } from "hono";
import { barAccess } from "../../middleware/context.ts";
import type { AppEnv } from "../../types.ts";
import { getBar } from "../me/repo.ts";

/** Routes under `/api/bars/:barId`. Every bar-scoped module is mounted here, behind `barAccess`. */
export const barRoutes = new Hono<AppEnv>().use(barAccess).get("/", (c) => {
  const { db, barId, role } = c.var.ctx;
  const bar = getBar(db, barId) as { id: string; name: string };
  const body: BarSummary = { ...bar, role };
  return c.json(body);
});
