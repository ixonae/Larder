import { expect, it } from "vitest";
import { relativeTime } from "./relative-time.ts";

/** A local time on 15 June 2026, so the calendar-day cases hold in any time zone. */
const local = (day: number, hour: number, minute = 0, second = 0): string =>
  new Date(2026, 5, day, hour, minute, second).toISOString();
const now: number = Date.parse(local(15, 12));

it("describes how long ago something happened", () => {
  expect(relativeTime(local(15, 11, 59, 50), now)).toBe("just now");
  expect(relativeTime(local(15, 11, 55), now)).toBe("5 minutes ago");
  expect(relativeTime(local(15, 9), now)).toBe("3 hours ago");
  expect(relativeTime(local(14, 11), now)).toBe("yesterday");
  expect(relativeTime("2026-01-01T12:00:00.000Z", now)).toBe(
    new Date("2026-01-01T12:00:00.000Z").toLocaleDateString("en"),
  );
});

it("counts calendar days once a day has passed", () => {
  const wednesday: number = Date.parse(local(17, 0));
  expect(relativeTime(local(15, 1), wednesday)).toBe("2 days ago");
  expect(relativeTime(local(15, 23), Date.parse(local(17, 1)))).toBe("2 days ago");
});

it("defaults to the current time", () => {
  expect(relativeTime(new Date().toISOString())).toBe("just now");
});
