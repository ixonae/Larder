import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { concurrencyLimit } from "./auth/limit.ts";
import { currentUser, protectApi } from "./auth/middleware.ts";
import { rateLimit } from "./auth/rate-limit.ts";
import { authRoutes } from "./auth/routes.ts";
import type { Db } from "./db/client.ts";
import type { Logger } from "./logger.ts";
import { admitBodies, MAX_PUBLIC_BODY_BYTES } from "./middleware/body.ts";
import { handleError, handleNotFound } from "./middleware/errors.ts";
import { adminRoutes } from "./modules/admin/routes.ts";
import { barDirectoryRoutes, barRoutes } from "./modules/bars/routes.ts";
import { imageRoutes } from "./modules/images/routes.ts";
import { invitationRoutes, publicInvitationRoutes } from "./modules/invitations/routes.ts";
import { meRoutes } from "./modules/me/routes.ts";
import { webApp } from "./static.ts";
import type { ImageStorage } from "./storage/storage.ts";
import type { AppEnv } from "./types.ts";

export interface AppDeps {
  logger: Logger;
  db: Db;
  /** Where uploaded pictures are kept. */
  storage: ImageStorage;
  /** The browser-facing origin, including when TLS terminates at a reverse proxy. */
  publicUrl?: string;
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
// biome-ignore lint/nursery/useExplicitType: Hono infers the complete RPC schema from the mounted routes.
export function createApp({
  logger,
  db,
  storage,
  publicUrl,
  webDir,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
}: AppDeps) {
  const app: Hono<AppEnv> = new Hono<AppEnv>();

  const limitUploads: AppEnv["Variables"]["limitUploads"] = rateLimit(20);
  const limitAttempts: ReturnType<typeof rateLimit> = rateLimit(10);
  const queue: ReturnType<typeof concurrencyLimit> = concurrencyLimit(2, 4);
  const credentialCheck = <T>(key: string, task: () => Promise<T>): Promise<T> => {
    limitAttempts(key);
    return queue(task);
  };
  app.use(requestId());
  app.use(async (c, next) => {
    c.set("logger", logger);
    c.set("db", db);
    c.set("storage", storage);
    c.set("limitUploads", limitUploads);
    c.set("credentialCheck", credentialCheck);
    c.set("publicUrl", publicUrl);
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

  app.use("/api/*", protectApi);

  // Public traffic has its own small allocation and cannot occupy upload slots.
  const publicBody = admitBodies(Math.min(maxBodyBytes, MAX_PUBLIC_BODY_BYTES), 8);
  const privateBody = admitBodies(maxBodyBytes, 4);

  // Deny by default: only the routes mounted before `currentUser` answer signed-out requests.
  const routes = app
    .get("/api/health", (c) => c.json({ status: "ok" as const }))
    .route("/api/auth", authRoutes(publicBody))
    .route("/api/invitations", publicInvitationRoutes(publicBody))
    .use("/api/*", currentUser)
    .use("/api/*", privateBody)
    .route("/api/admin", adminRoutes)
    .route("/api/me", meRoutes)
    .route("/api/bars", barDirectoryRoutes)
    .route("/api/bars/:barId", barRoutes)
    .route("/api/invitations", invitationRoutes)
    .route("/api/images", imageRoutes);

  if (webDir) app.get("*", webApp(webDir));

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
