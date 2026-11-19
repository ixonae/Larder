import type { AppType } from "@larder/api/app";
import { type ErrorCode, errorBodySchema } from "@larder/shared";
import { hc } from "hono/client";

/** Typed RPC client for the Larder API (types come straight from the Hono routes). */
export const api = hc<AppType>(window.location.origin);

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Returns the JSON body of a successful response, or throws an `ApiError` built from the error body. */
export async function unwrap<T>(res: {
  ok: boolean;
  status: number;
  json(): Promise<T>;
}): Promise<T> {
  if (res.ok) return res.json();
  const body: unknown = await res.json().catch(() => null);
  const parsed = errorBodySchema.safeParse(body);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    throw new ApiError(res.status, code, message, details);
  }
  throw new ApiError(res.status, "INTERNAL", `Request failed (${res.status})`);
}
