import { Hono } from "hono";
import type { AppEnv } from "../../types.ts";
import { getMe } from "./service.ts";

export const meRoutes = new Hono<AppEnv>().get("/", (c) => c.json(getMe(c.var.db, c.var.user)));
