import { describe, expect, it } from "vitest";
import { ApiError, unwrap } from "./client.ts";

const response = (status: number, body: unknown): Response =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("unwrap", () => {
  it("returns the body of a successful response", async () => {
    expect(await unwrap(response(200, { a: 1 }))).toEqual({ a: 1 });
  });

  it("returns undefined for No Content", async () => {
    expect(await unwrap(new Response(null, { status: 204 }))).toBeUndefined();
  });

  it("throws an ApiError built from the error body", async () => {
    const err: unknown = await unwrap<unknown>(
      response(409, { error: { code: "CONFLICT", message: "In use", details: ["Negroni"] } }),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      name: "ApiError",
      status: 409,
      code: "CONFLICT",
      message: "In use",
      details: ["Negroni"],
    });
  });

  it.each([
    ["a non-JSON body", "<html>Bad gateway</html>"],
    ["an unexpected JSON body", { oops: true }],
  ])("falls back to a generic error for %s", async (_, body) => {
    await expect(unwrap(response(502, body))).rejects.toMatchObject({
      status: 502,
      code: "INTERNAL",
      message: "Request failed (502)",
    });
  });
});
