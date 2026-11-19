import { describe, expect, it } from "vitest";
import { ERROR_CODES, ERROR_STATUS, errorBody, errorBodySchema } from "./errors.ts";

describe("errorBody", () => {
  it("builds a body without details", () => {
    expect(errorBody("NOT_FOUND", "Nope")).toEqual({
      error: { code: "NOT_FOUND", message: "Nope" },
    });
  });

  it("builds a body with details", () => {
    const body = errorBody("CONFLICT", "In use", { usedBy: ["x"] });
    expect(body.error.details).toEqual({ usedBy: ["x"] });
    expect(errorBodySchema.parse(body)).toEqual(body);
  });
});

describe("errorBodySchema", () => {
  it("rejects unknown codes", () => {
    expect(errorBodySchema.safeParse({ error: { code: "TEAPOT", message: "x" } }).success).toBe(
      false,
    );
  });
});

describe("ERROR_STATUS", () => {
  it("maps every code to an HTTP error status", () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });
});
