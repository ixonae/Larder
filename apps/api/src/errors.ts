import { type ErrorCode, idSchema, type UsageType, type UsedBy } from "@larder/shared";

/** A domain error; the central error handler turns it into the shared JSON error shape. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;
  /** Extra response headers, such as `Retry-After`. */
  readonly headers: Record<string, string>;

  constructor(
    code: ErrorCode,
    message: string,
    details?: unknown,
    headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

/** `429` with the seconds to wait before trying again. */
export const rateLimited = (retryAfter: number): AppError =>
  new AppError("RATE_LIMITED", "Too many requests. Try again shortly.", undefined, {
    "Retry-After": String(retryAfter),
  });

export const notFound = (what: string = "Resource"): AppError =>
  new AppError("NOT_FOUND", `${what} not found`);
export const forbidden = (message: string = "You do not have access to this resource"): AppError =>
  new AppError("FORBIDDEN", message);
export const conflict = (message: string, details?: unknown): AppError =>
  new AppError("CONFLICT", message, details);
/** `id` from the URL when it is a well-formed id; anything else is reported as `what` not found. */
export function parseId(id: string | undefined, what: string): string {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) throw notFound(what);
  return parsed.data;
}

export const invalid = (message: string, details?: unknown): AppError =>
  new AppError("VALIDATION", message, details);

/** One kind of thing that can stop a delete: its `used_by` type, a plural label, and the rows. */
export interface Usage {
  type: UsageType;
  label: string;
  rows: { id: string; name: string }[];
}

/**
 * Refuses deleting `name` with `CONFLICT` while anything in `usages` still uses it. The message names
 * each kind ("still has sub-categories and bottles") and `details.used_by` lists every row.
 */
export function refuseDeleteIfUsed(name: string, usages: Usage[]): void {
  const used = usages.filter((u) => u.rows.length > 0);
  if (used.length === 0) return;
  const labels = used.map((u) => u.label);
  const list =
    labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0];
  const details: UsedBy = {
    used_by: used.flatMap(({ type, rows }) => rows.map(({ id, name }) => ({ type, id, name }))),
  };
  throw conflict(`"${name}" still has ${list}`, details);
}
