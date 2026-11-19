import type { ErrorCode } from "@larder/shared";

/** A domain error; the central error handler turns it into the shared JSON error shape. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found`);
export const forbidden = (message = "You do not have access to this resource") =>
  new AppError("FORBIDDEN", message);
export const conflict = (message: string, details?: unknown) =>
  new AppError("CONFLICT", message, details);
