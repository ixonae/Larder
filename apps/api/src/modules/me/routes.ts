import type { Me } from "@larder/shared";
import { Hono } from "hono";
import type { AppEnv } from "../../types.ts";
import { listBarsForUser } from "./repo.ts";

export const meRoutes = new Hono<AppEnv>().get("/", (c) => {
  const user = c.var.user;
  const body: Me = { user, bars: listBarsForUser(c.var.db, user.id) };
  return c.json(body);
});
