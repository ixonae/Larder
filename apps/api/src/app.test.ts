import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, conflict, forbidden, notFound } from "./errors.ts";
import { validate } from "./middleware/validate.ts";
import { createTestApp, errorOf, jsonRequest } from "./test/app.ts";

const setup: typeof createTestApp = createTestApp;

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const { app } = setup();
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("sets a request id and logs the request", async () => {
    const { app, logs } = setup();
    const res = await app.request("/api/health");
    const id = res.headers.get("X-Request-Id");
    expect(id).toBeTruthy();
    expect(logs()).toContainEqual(
      expect.objectContaining({ msg: "request", requestId: id, status: 200, path: "/api/health" }),
    );
  });
});

describe("security headers", () => {
  it.each([
    ["a JSON response", "/api/health"],
    ["an error response", "/api/nope"],
  ])("are set on %s", async (_, path) => {
    const { app } = setup();
    const res = await app.request(path);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("Content-Security-Policy")).toContain("script-src 'self'");
  });
});

describe("body limit", () => {
  const post = (body: string): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  it("refuses API bodies over the limit with PAYLOAD_TOO_LARGE", async () => {
    const { app } = setup({ maxBodyBytes: 16 });
    app.post("/api/echo", (c) => c.text("ok"));
    const res = await app.request("/api/echo", post(JSON.stringify({ name: "x".repeat(32) })));
    expect(res.status).toBe(413);
    expect(await errorOf(res)).toEqual({
      code: "PAYLOAD_TOO_LARGE",
      message: "Request body is larger than 16 bytes",
    });
  });

  it("accepts bodies within the limit", async () => {
    const { app } = setup({ maxBodyBytes: 16 });
    app.post("/api/echo", async (c) => c.text(await c.req.text()));
    const res = await app.request("/api/echo", post("{}"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("{}");
  });

  it("defaults to 10 MB", async () => {
    const { app } = setup();
    app.post("/api/echo", (c) => c.text("ok"));
    const res = await app.request("/api/echo", post("x".repeat(10 * 1024 * 1024 + 1)));
    expect(res.status).toBe(413);
  });
});

describe("errors", () => {
  it("answers unknown routes with NOT_FOUND", async () => {
    const { app } = setup();
    const res = await app.request("/api/nope", { method: "POST" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "No route for POST /api/nope" },
    });
  });

  it("reports validation failures in the error shape", async () => {
    const { app } = setup();
    app.post("/test", validate("json", z.object({ name: z.string().min(1) })), (c) =>
      c.json(c.req.valid("json")),
    );
    const res = await app.request("/test", jsonRequest("POST", { name: "" }));
    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error.code).toBe("VALIDATION");
    expect(error.message).toBe("Invalid json");
    expect(error.details).toEqual([expect.objectContaining({ path: ["name"] })]);

    const ok = await app.request("/test", jsonRequest("POST", { name: "Gin" }));
    expect(await ok.json()).toEqual({ name: "Gin" });
  });

  it("maps a thrown ZodError to VALIDATION", async () => {
    const { app } = setup();
    app.get("/test", () => {
      z.number().parse("x");
      return new Response();
    });
    const res = await app.request("/test");
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("VALIDATION");
  });

  it.each([
    [notFound("Bottle"), 404, "NOT_FOUND", "Bottle not found"],
    [notFound(), 404, "NOT_FOUND", "Resource not found"],
    [forbidden(), 403, "FORBIDDEN", "You do not have access to this resource"],
    [conflict("In use", { usedBy: ["Negroni"] }), 409, "CONFLICT", "In use"],
  ])("maps domain error %#", async (err, status, code, message) => {
    const { app } = setup();
    app.get("/test", () => {
      throw err;
    });
    const res = await app.request("/test");
    expect(res.status).toBe(status);
    const error = await errorOf(res);
    expect(error).toMatchObject({ code, message });
    expect(error.details).toEqual(err.details);
  });

  it("maps HTTP exceptions and keeps their headers", async () => {
    const { app } = setup();
    app.get("/test", () => {
      throw new HTTPException(401, {
        res: new Response("x", { headers: { "WWW-Authenticate": 'Basic realm="Larder"' } }),
      });
    });
    const res = await app.request("/test");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Basic realm="Larder"');
    expect(await res.json()).toEqual({ error: { code: "UNAUTHORIZED", message: "UNAUTHORIZED" } });
  });

  it("uses the HTTP exception message when there is one", async () => {
    const { app } = setup();
    app.get("/test", () => {
      throw new HTTPException(413, { message: "Too big" });
    });
    const res = await app.request("/test");
    expect(await res.json()).toEqual({ error: { code: "PAYLOAD_TOO_LARGE", message: "Too big" } });
  });

  it.each([
    ["an unexpected error", new Error("secret detail")],
    ["an unmapped HTTP exception", new HTTPException(418, { message: "teapot" })],
  ])("hides %s behind a 500 and logs it", async (_, err) => {
    const { app, logs } = setup();
    app.get("/test", () => {
      throw err;
    });
    const res = await app.request("/test");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "INTERNAL", message: "Internal server error" },
    });
    expect(logs()).toContainEqual(
      expect.objectContaining({ level: "error", msg: "unhandled error", error: err.message }),
    );
  });

  it("keeps AppError instances identifiable", () => {
    const err = new AppError("INTERNAL", "x");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AppError");
  });
});
