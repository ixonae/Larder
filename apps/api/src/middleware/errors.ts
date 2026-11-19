import { ERROR_STATUS, type ErrorCode, errorBody } from "@larder/shared";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { AppError } from "../errors.ts";
import type { AppEnv } from "../types.ts";

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  400: "VALIDATION",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
};

function respond(c: Context<AppEnv>, code: ErrorCode, message: string, details?: unknown) {
  return c.json(errorBody(code, message, details), ERROR_STATUS[code]);
}

/** Central error handler: every failure leaves the API as `{ error: { code, message, details? } }`. */
export function handleError(err: Error, c: Context<AppEnv>) {
  if (err instanceof AppError) return respond(c, err.code, err.message, err.details);
  if (err instanceof ZodError) return respond(c, "VALIDATION", "Invalid request", err.issues);
  if (err instanceof HTTPException) {
    const code = CODE_BY_STATUS[err.status];
    if (code) {
      const res = respond(c, code, err.message || code);
      // Keep headers such as WWW-Authenticate set by the thrower.
      err.getResponse().headers.forEach((value, key) => {
        if (key !== "content-type" && key !== "content-length") res.headers.set(key, value);
      });
      return res;
    }
  }
  c.var.logger.error("unhandled error", {
    requestId: c.var.requestId,
    error: err.message,
    stack: err.stack,
  });
  return respond(c, "INTERNAL", "Internal server error");
}

export function handleNotFound(c: Context<AppEnv>) {
  return respond(c, "NOT_FOUND", `No route for ${c.req.method} ${c.req.path}`);
}
