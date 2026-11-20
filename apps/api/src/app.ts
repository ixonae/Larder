import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { passwordAuth } from "./auth/middleware.ts";
import type { Db } from "./db/client.ts";
import { DEFAULT_USER } from "./db/seed.ts";
import { AppError } from "./errors.ts";
import type { Logger } from "./logger.ts";
import { currentUser } from "./middleware/context.ts";
import { handleError, handleNotFound } from "./middleware/errors.ts";
import { barRoutes } from "./modules/bars/routes.ts";
import { imageRoutes } from "./modules/images/routes.ts";
import { meRoutes } from "./modules/me/routes.ts";
import { webApp } from "./static.ts";
import type { ImageStorage } from "./storage/storage.ts";
import type { AppEnv } from "./types.ts";

export interface AppDeps {
  logger: Logger;
  db: Db;
  /** Where uploaded pictures are kept. */
  storage: ImageStorage;
  /** Email of the user every request acts as, until real auth lands (phase 6). */
  userEmail?: string;
  /** When set, every route except `/api/health` requires HTTP Basic auth with this password. */
  passwordHash?: string;
  /** Directory of the built web app to serve (production). */
  webDir?: string;
  /** Largest request body accepted, in bytes; bigger ones get `PAYLOAD_TOO_LARGE`. */
  maxBodyBytes?: number;
}

export const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * The SPA only loads its own bundled scripts, styles and images. Inline styles stay allowed because
 * Radix positions popovers with `style` attributes.
 */
const CONTENT_SECURITY_POLICY = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:", "blob:"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};

/** Builds the Hono app without listening, so tests can call `app.request()`. */
export function createApp({
  logger,
  db,
  storage,
  userEmail = DEFAULT_USER.email,
  passwordHash,
  webDir,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
}: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use(requestId());
  app.use(async (c, next) => {
    c.set("logger", logger);
    c.set("db", db);
    c.set("storage", storage);
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

  app.use(secureHeaders({ contentSecurityPolicy: CONTENT_SECURITY_POLICY }));

  app.onError(handleError);
  app.notFound(handleNotFound);

  if (passwordHash) app.use(passwordAuth(passwordHash));

  app.use(
    "/api/*",
    bodyLimit({
      maxSize: maxBodyBytes,
      onError: () => {
        throw new AppError(
          "PAYLOAD_TOO_LARGE",
          `Request body is larger than ${maxBodyBytes} bytes`,
        );
      },
    }),
  );

  const withUser = currentUser(userEmail);
  app.use("/api/me", withUser);
  app.use("/api/bars/*", withUser);
  app.use("/api/images/*", withUser);

  const routes = app
    .get("/api/health", (c) => c.json({ status: "ok" as const }))
    .route("/api/me", meRoutes)
    .route("/api/bars/:barId", barRoutes)
    .route("/api/images", imageRoutes);

  if (webDir) app.get("*", webApp(webDir));

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
