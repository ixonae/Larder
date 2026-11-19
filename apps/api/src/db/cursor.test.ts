import { describe, expect, it } from "vitest";
import { AppError } from "../errors.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";

describe("cursor", () => {
  it("round-trips", () => {
    const cursor = { key: "crème", id: "01a1f326-d941-7d74-8a40-504a488cd388" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each([
    ["not base64 JSON", "%%%"],
    ["a wrong shape", Buffer.from(JSON.stringify(["a"])).toString("base64url")],
    ["wrong types", Buffer.from(JSON.stringify([1, "a"])).toString("base64url")],
    ["a non-array", Buffer.from(JSON.stringify({ key: "a" })).toString("base64url")],
    ["a second non-string", Buffer.from(JSON.stringify(["a", 2])).toString("base64url")],
  ])("refuses %s", (_, cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(AppError);
    expect(() => decodeCursor(cursor)).toThrow("Invalid cursor");
  });
});
