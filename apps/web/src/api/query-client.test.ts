import { describe, expect, it } from "vitest";
import { ApiError } from "./client.ts";
import { createQueryClient, MAX_RETRIES, shouldRetry } from "./query-client.ts";

describe("shouldRetry", () => {
  it.each([401, 403, 404, 409])("does not retry a %i answer", (status) => {
    expect(shouldRetry(0, new ApiError(status, "NOT_FOUND", "x"))).toBe(false);
  });

  it("retries server errors and network failures up to the limit", () => {
    const serverError = new ApiError(500, "INTERNAL", "x");
    const networkError = new TypeError("Failed to fetch");
    expect(shouldRetry(0, serverError)).toBe(true);
    expect(shouldRetry(MAX_RETRIES - 1, networkError)).toBe(true);
    expect(shouldRetry(MAX_RETRIES, serverError)).toBe(false);
  });

  it("is the default retry rule of the app's query client", () => {
    expect(createQueryClient().getDefaultOptions().queries?.retry).toBe(shouldRetry);
  });
});
