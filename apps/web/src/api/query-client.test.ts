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

describe("mutation meta", () => {
  it("invalidates the listed queries after a successful mutation, and only then", async () => {
    const client = createQueryClient();
    client.setQueryData(["derived"], 1);
    client.setQueryData(["other"], 1);
    const run = (fn: () => Promise<unknown>, meta?: { invalidates: string[][] }) =>
      client
        .getMutationCache()
        .build(client, { mutationFn: fn, meta })
        .execute(undefined)
        .catch(() => undefined);
    const stale = (key: string) => client.getQueryState([key])?.isInvalidated;

    await run(() => Promise.reject(new Error("failed")), { invalidates: [["derived"]] });
    await run(() => Promise.resolve());
    expect(stale("derived")).toBe(false);

    await run(() => Promise.resolve(), { invalidates: [["derived"]] });
    expect(stale("derived")).toBe(true);
    expect(stale("other")).toBe(false);
  });
});
