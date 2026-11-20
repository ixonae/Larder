import { z } from "zod";

/** ISO-8601 UTC timestamp, e.g. `2026-11-19T12:00:00.000Z`. */
export const isoDateTimeSchema = z.iso.datetime();
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;

/** Current time as an ISO-8601 UTC string (the format stored in `created_at` / `updated_at`). */
export function nowIso(date: Date = new Date()): IsoDateTime {
  return date.toISOString();
}

/** A calendar date, `YYYY-MM-DD` (purchases, "ran out" dates). */
export const isoDateSchema = z.iso.date();
export type IsoDate = z.infer<typeof isoDateSchema>;

/** Today's UTC date as `YYYY-MM-DD`. */
export function todayIso(date: Date = new Date()): IsoDate {
  return date.toISOString().slice(0, 10);
}
