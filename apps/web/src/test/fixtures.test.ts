import { expect, it } from "vitest";
import { fixtureId } from "./fixtures.ts";

it("builds fixed ids and refuses numbers that do not fit after the prefix", () => {
  expect(fixtureId(7)).toBe("01a1f326-d941-7d74-8a40-000000000007");
  expect(fixtureId(7, "504a488cd")).toBe("01a1f326-d941-7d74-8a40-504a488cd007");
  expect(() => fixtureId(1000, "504a488cd")).toThrow(
    'Fixture id 1000 does not fit after "504a488cd"',
  );
});
