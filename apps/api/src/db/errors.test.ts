import { describe, expect, it } from "vitest";
import { onUniqueViolation } from "./errors.ts";

const fail = (err: unknown) => () => {
  throw err;
};
const duplicate = () => new Error("duplicate");

describe("onUniqueViolation", () => {
  it("returns the result", () => {
    expect(onUniqueViolation(() => 1, duplicate)).toBe(1);
  });

  it("replaces a unique violation", () => {
    const unique = Object.assign(new Error("UNIQUE"), { code: "SQLITE_CONSTRAINT_UNIQUE" });
    expect(() => onUniqueViolation(fail(unique), duplicate)).toThrow("duplicate");
  });

  it.each([
    [
      "a primary key clash",
      Object.assign(new Error("pk"), { code: "SQLITE_CONSTRAINT_PRIMARYKEY" }),
    ],
    ["another error", new Error("boom")],
    ["a thrown null", null],
  ])("rethrows %s", (_, err) => {
    expect(() => onUniqueViolation(fail(err), duplicate)).toThrow();
    expect(() => onUniqueViolation(fail(err), duplicate)).not.toThrow("duplicate");
  });
});
