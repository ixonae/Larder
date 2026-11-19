import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { passwordAuth } from "./auth/middleware.ts";
import type { Db } from "./db/client.ts";
import { DEFAULT_USER } from "./db/seed.ts";
import type { Logger } from "./logger.ts";
import { currentUser } from "./middleware/context.ts";
import { handleError, handleNotFound } from "./middleware/errors.ts";
import { barRoutes } from "./modules/bars/routes.ts";
import { meRoutes } from "./modules/me/routes.ts";
import { webApp } from "./static.ts";
import type { AppEnv } from "./types.ts";

export interface AppDeps {
  logger: Logger;
  db: Db;
  /** Email of the user every request acts as, until real auth lands (phase 6). */
  userEmail?: string;
  /** When set, every route except `/api/health` requires HTTP Basic auth with this password. */
  passwordHash?: string | undefined;
  /** Directory of the built web app to serve (production). */
  webDir?: string | undefined;
}

/** Builds the Hono app without listening, so tests can call `app.request()`. */
export function createApp({
  logger,
  db,
  userEmail = DEFAULT_USER.email,
  passwordHash,
  webDir,
}: AppDeps) {
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

  if (passwordHash) app.use(passwordAuth(passwordHash));

  const withUser = currentUser(userEmail);
  app.use("/api/me", withUser);
  app.use("/api/bars/*", withUser);

  const routes = app
    .get("/api/health", (c) => c.json({ status: "ok" as const }))
    .route("/api/me", meRoutes)
    .route("/api/bars/:barId", barRoutes);

  if (webDir) app.get("*", webApp(webDir));

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
