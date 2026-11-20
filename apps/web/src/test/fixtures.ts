import type { ErrorCode } from "@larder/shared";
import { HttpResponse } from "msw";

/** A fixed UUID for fixtures. `prefix` (hex) keeps one test file's ids apart from another's. */
export function fixtureId(n: number, prefix = "") {
  const last = `${prefix}${String(n).padStart(12 - prefix.length, "0")}`;
  if (last.length !== 12) throw new Error(`Fixture id ${n} does not fit after "${prefix}"`);
  return `01a1f326-d941-7d74-8a40-${last}`;
}

/** `created_at` / `updated_at` for fixtures. */
export const timestamps = {
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

/** An MSW answer holding one page of a list endpoint. */
export const page = <T>(items: T[], next_cursor: string | null = null) =>
  HttpResponse.json({ items, next_cursor });

/** An MSW answer in the API's error shape. */
export const failure = (
  code: ErrorCode,
  status: number,
  message: string = code,
  details?: unknown,
) => HttpResponse.json({ error: { code, message, details } }, { status });
