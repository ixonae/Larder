import { todayIso } from "@larder/shared";

/** Today in the viewer's time zone, as `YYYY-MM-DD`: the default for purchase and ran-out dates. */
export const localToday = (now = new Date()): string =>
  todayIso(new Date(now.getTime() - now.getTimezoneOffset() * 60_000));

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** `2026-11-01` → "Nov 1, 2026". */
export const formatDate = (date: string): string => dateFormat.format(new Date(date));
