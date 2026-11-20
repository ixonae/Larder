const HOUR: number = 3_600_000;
const MINUTE: number = 60_000;
const DAY: number = 24 * HOUR;
const formatter: Intl.RelativeTimeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Local midnight of the day `time` falls on. */
const startOfDay = (time: number): number => new Date(time).setHours(0, 0, 0, 0);

/**
 * "just now", "5 minutes ago", "3 hours ago" within a day; then calendar days ("yesterday",
 * "2 days ago"); anything older than a month is a plain date.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then: number = new Date(iso).getTime();
  const elapsed: number = now - then;
  if (elapsed > 30 * DAY) return new Date(iso).toLocaleDateString("en");
  if (elapsed >= DAY) {
    // Rounded: a daylight-saving change makes a calendar day 23 or 25 hours long.
    const days: number = Math.round((startOfDay(now) - startOfDay(then)) / DAY);
    return formatter.format(-days, "day");
  }
  if (elapsed >= HOUR) return formatter.format(-Math.floor(elapsed / HOUR), "hour");
  if (elapsed >= MINUTE) return formatter.format(-Math.floor(elapsed / MINUTE), "minute");
  return "just now";
}
