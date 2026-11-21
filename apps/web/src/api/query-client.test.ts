import { describe, expect, it, vi } from "vitest";
import { meFixture } from "@/test/msw.ts";
import { ApiError } from "./client.ts";
import { meQuery } from "./queries.ts";
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

describe("unauthorized answers", () => {
  const unauthorized = new ApiError(401, "UNAUTHORIZED", "Sign in to continue");
  const fail = (client: ReturnType<typeof createQueryClient>, error: unknown): Promise<undefined> =>
    client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(error) })
      .execute(undefined)
      .catch(() => undefined);

  it("signs out and drops cached data when a session stops working", async () => {
    const client = createQueryClient();
    client.setQueryData(meQuery.queryKey, meFixture);
    client.setQueryData(["bars", "x"], 1);
    await fail(client, new ApiError(404, "NOT_FOUND", "x"));
    expect(client.getQueryData(meQuery.queryKey)).toEqual(meFixture);

    await client
      .fetchQuery({ queryKey: ["bars", "y"], queryFn: () => Promise.reject(unauthorized) })
      .catch(() => undefined);
    await vi.waitFor(() => expect(client.getQueryData(meQuery.queryKey)).toBeNull());
    expect(client.getQueryData(["bars", "x"])).toBeUndefined();
  });

  it("leaves the cache alone when already signed out", async () => {
    const client = createQueryClient();
    client.setQueryData(meQuery.queryKey, null);
    client.setQueryData(["signup-settings"], 1);
    await fail(client, unauthorized);
    expect(client.getQueryData(["signup-settings"])).toBe(1);
  });
});

describe("mutation meta", () => {
  it("invalidates the listed queries after a successful mutation, and only then", async () => {
    const client = createQueryClient();
    client.setQueryData(["derived"], 1);
    client.setQueryData(["other"], 1);
    const run = (
      fn: () => Promise<unknown>,
      meta?: { invalidates: string[][] },
    ): Promise<unknown> =>
      client
        .getMutationCache()
        .build(client, { mutationFn: fn, meta })
        .execute(undefined)
        .catch(() => undefined);
    const stale = (key: string): boolean | undefined => client.getQueryState([key])?.isInvalidated;

    await run(() => Promise.reject(new Error("failed")), { invalidates: [["derived"]] });
    await run(() => Promise.resolve());
    expect(stale("derived")).toBe(false);

    await run(() => Promise.resolve(), { invalidates: [["derived"]] });
    expect(stale("derived")).toBe(true);
    expect(stale("other")).toBe(false);
  });
});
