import { Hono } from "hono";
import { requestId } from "hono/request-id";
import type { Logger } from "./logger.ts";
import { handleError, handleNotFound } from "./middleware/errors.ts";
import type { AppEnv } from "./types.ts";

export interface AppDeps {
  logger: Logger;
}

/** Builds the Hono app without listening, so tests can call `app.request()`. */
export function createApp({ logger }: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use(requestId());
  app.use(async (c, next) => {
    c.set("logger", logger);
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

  const routes = app.get("/api/health", (c) => c.json({ status: "ok" as const }));

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
