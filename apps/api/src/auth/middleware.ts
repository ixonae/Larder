import { SESSION_REQUEST_HEADER } from "@larder/shared";
import type { Context, TypedResponse } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { AppError, forbidden } from "../errors.ts";
import type { AppEnv } from "../types.ts";
import { peerKey } from "./rate-limit.ts";
import { SESSION_TTL_SECONDS, sessionUser } from "./service.ts";

export const SESSION_COOKIE = "larder_session";

export const sessionCookie = (c: Context<AppEnv>): string => getCookie(c, SESSION_COOKIE) ?? "";

export function writeSessionCookie(
  c: Context<AppEnv>,
  token: string,
  maxAge: number = SESSION_TTL_SECONDS,
): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: c.var.publicUrl?.startsWith("https://") ?? false,
    path: "/",
    maxAge,
  });
}

/** Sets the new session cookie and answers 204. */
export function respondWithSession(
  c: Context<AppEnv>,
  token: string,
): Response & TypedResponse<null, 204, "body"> {
  writeSessionCookie(c, token);
  return c.body(null, 204);
}

/** Rate-limits by peer and queues the rest of the request behind the password-hashing slots. */
export const limitCredentials = createMiddleware<AppEnv>((c, next) =>
  c.var.credentialCheck(peerKey(c), next),
);

export const currentUser = createMiddleware<AppEnv>(async (c, next) => {
  const user = sessionUser(c.var.db, sessionCookie(c));
  if (!user) throw new AppError("UNAUTHORIZED", "Sign in to continue");
  c.set("user", user);
  await next();
});

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** A cross-origin browser cannot send this header without a CORS preflight. */
export const protectApi = createMiddleware<AppEnv>(async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  if (!SAFE_METHODS.has(c.req.method)) {
    if (c.req.header(SESSION_REQUEST_HEADER) !== "1") throw forbidden("Missing request header");
    const origin = c.req.header("Origin");
    if (origin && c.var.publicUrl && origin !== c.var.publicUrl) throw forbidden("Invalid origin");
  }
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user.is_admin) throw forbidden("This action needs an installation admin");
  await next();
});
