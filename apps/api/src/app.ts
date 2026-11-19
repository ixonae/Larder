import { Hono } from "hono";
import { requestId } from "hono/request-id";
import type { Db } from "./db/client.ts";
import { DEFAULT_USER } from "./db/seed.ts";
import type { Logger } from "./logger.ts";
import { currentUser } from "./middleware/context.ts";
import { handleError, handleNotFound } from "./middleware/errors.ts";
import { barRoutes } from "./modules/bars/routes.ts";
import { meRoutes } from "./modules/me/routes.ts";
import type { AppEnv } from "./types.ts";

export interface AppDeps {
  logger: Logger;
  db: Db;
  /** Email of the user every request acts as, until real auth lands (phase 6). */
  userEmail?: string;
}

/** Builds the Hono app without listening, so tests can call `app.request()`. */
export function createApp({ logger, db, userEmail = DEFAULT_USER.email }: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use(requestId());
  app.use(async (c, next) => {
    c.set("logger", logger);
    c.set("db", db);
    const start = performance.now();
    await next();
    logger.info("request", {
      requestId: c.var.requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - start),
    });
  });

  app.onError(handleError);
  app.notFound(handleNotFound);

  const withUser = currentUser(userEmail);
  app.use("/api/me", withUser);
  app.use("/api/bars/*", withUser);

  const routes = app
    .get("/api/health", (c) => c.json({ status: "ok" as const }))
    .route("/api/me", meRoutes)
    .route("/api/bars/:barId", barRoutes);

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
