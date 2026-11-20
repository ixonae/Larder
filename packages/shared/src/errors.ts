import { z } from "zod";

export const ERROR_CODES = [
  "VALIDATION",
  "NOT_FOUND",
  "CONFLICT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "INTERNAL",
  "UNAVAILABLE",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** HTTP status the API answers with for each error code. */
export const ERROR_STATUS = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  UNAVAILABLE: 503,
} as const satisfies Record<ErrorCode, number>;

/** The single JSON error shape: `{ error: { code, message, details? } }`. */
export const errorBodySchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;

export const USAGE_TYPES = [
  "bar",
  "category",
  "product",
  "purchase",
  "tasting",
  "pantry_ingredient",
  "cocktail",
  "utensil",
] as const;

export type UsageType = (typeof USAGE_TYPES)[number];

/** `details` of a `CONFLICT` refusing a delete: what still uses the item. */
export const usedBySchema = z.object({
  used_by: z.array(z.object({ type: z.enum(USAGE_TYPES), id: z.string(), name: z.string() })),
});
export type UsedBy = z.infer<typeof usedBySchema>;

export function errorBody(code: ErrorCode, message: string, details?: unknown): ErrorBody {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}
