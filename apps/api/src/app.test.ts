import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { getRequestListener } from "@hono/node-server";
import { SESSION_REQUEST_HEADER } from "@larder/shared";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AppType } from "./app.ts";
import { bars, sessions } from "./db/schema/index.ts";
import { AppError, conflict, forbidden, notFound } from "./errors.ts";
import { MAX_PUBLIC_BODY_BYTES, PUBLIC_BODY_TIMEOUT_MS } from "./middleware/body.ts";
import { validate } from "./middleware/validate.ts";
import { createTestApp, errorOf, jsonRequest } from "./test/app.ts";

const setup: typeof createTestApp = createTestApp;

/** Pass an HTTP/1 message through the production adapter without opening a listening socket. */
async function nodeRequest(
  app: AppType,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string,
): Promise<number> {
  const incoming = new IncomingMessage(new Socket());
  incoming.method = method;
  incoming.url = path;
  incoming.httpVersionMajor = 1;
  const requestHeaders = new Headers({
    host: "localhost",
    [SESSION_REQUEST_HEADER]: "1",
    ...headers,
  });
  incoming.rawHeaders = [...requestHeaders].flat();
  incoming.headers = Object.fromEntries(requestHeaders);
  incoming.complete = true;
  if (body !== undefined) incoming.push(Buffer.from(body));
  incoming.push(null);
  const outgoing = new ServerResponse(incoming);
  await getRequestListener(app.fetch, { overrideGlobalObjects: false })(incoming, outgoing);
  return outgoing.statusCode;
}

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

  it.each(["/api/bars", "/api/invitations/accept", "/api/unknown"])(
    "authenticates before reading the body on %s",
    async (path) => {
      const { rawRequest } = setup({ maxBodyBytes: 16 });
      const request = new Request(new URL(path, "http://localhost"), {
        method: "POST",
        headers: { [SESSION_REQUEST_HEADER]: "1", "Content-Type": "application/json" },
        body: JSON.stringify({ name: "An oversized signed-out request" }),
      });
      const res = await rawRequest(request);
      expect(res.status).toBe(401);
      expect(request.bodyUsed).toBe(false);
    },
  );

  it.each([
    "auth/sign-in",
    "auth/sign-up",
    "auth/sign-out",
    "invitations/preview",
    "invitations/register",
  ])("enforces the public body cap on %s before handling the request", async (path) => {
    const { app } = setup();
    const res = await app.request(`/api/${path}`, post("x".repeat(MAX_PUBLIC_BODY_BYTES + 1)));
    expect(res.status).toBe(413);
    expect(await errorOf(res)).toEqual({
      code: "PAYLOAD_TOO_LARGE",
      message: `Request body is larger than ${MAX_PUBLIC_BODY_BYTES} bytes`,
    });
  });

  it("honours a lower configured limit for public forms", async () => {
    const { app } = setup({ maxBodyBytes: 16 });
    const res = await app.request("/api/invitations/preview", post("x".repeat(17)));
    expect(res.status).toBe(413);
    expect((await errorOf(res)).message).toBe("Request body is larger than 16 bytes");
  });

  it.each([true, false])(
    "rechecks the session after reading the body (declared length %s)",
    async (fixedLength) => {
      const { rawRequest, db, cookie } = setup();
      const before = db.select().from(bars).all();
      const payload = Buffer.from(JSON.stringify({ name: "New bar" }));
      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller: ReadableStreamDefaultController<Uint8Array>): void {
            db.delete(sessions).run();
            controller.enqueue(payload);
            controller.close();
          },
        },
        { highWaterMark: 0 },
      );
      const res = await rawRequest("/api/bars", {
        method: "POST",
        duplex: "half",
        body,
        headers: {
          cookie: cookie as string,
          "content-type": "application/json",
          [SESSION_REQUEST_HEADER]: "1",
          ...(fixedLength && { "content-length": String(payload.length) }),
        },
      });
      expect(res.status).toBe(401);
      expect(db.select().from(bars).all()).toEqual(before);
    },
  );

  it("releases public capacity after a read deadline and keeps other peers and empty sign-outs available", async () => {
    const { app, cookie } = setup();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const reading = Promise.withResolvers<void>();
      const cancelled = vi.fn();
      let started = 0;
      const pending = Array.from({ length: 2 }, () =>
        app.request("/api/invitations/preview", {
          method: "POST",
          duplex: "half",
          body: new ReadableStream<Uint8Array>(
            {
              pull(): void {
                if (++started === 2) reading.resolve();
              },
              cancel: cancelled,
            },
            { highWaterMark: 0 },
          ),
        }),
      );
      await reading.promise;
      const busy = await app.request("/api/auth/sign-in", post("{}"));
      expect(busy.status).toBe(429);
      expect(busy.headers.get("Retry-After")).toBe("1");
      const other = await app.request("/api/invitations/preview", post("{}"), {
        incoming: { socket: { remoteAddress: "192.0.2.2" } },
      });
      expect((await errorOf(other)).code).toBe("VALIDATION");
      expect(
        await nodeRequest(app, "POST", "/api/auth/sign-out", {
          "content-length": "0",
          cookie: cookie as string,
        }),
      ).toBe(204);
      expect((await app.request("/api/me")).status).toBe(401);
      await vi.advanceTimersByTimeAsync(PUBLIC_BODY_TIMEOUT_MS);
      for (const res of await Promise.all(pending)) {
        expect(await errorOf(res)).toEqual({
          code: "VALIDATION",
          message: "Request body timed out",
        });
      }
      expect(cancelled).toHaveBeenCalledTimes(2);
      expect((await app.request("/api/invitations/preview", post("{}"))).status).toBe(400);
    } finally {
      vi.useRealTimers();
    }
  });

  it("checks both declared and streamed sizes and preserves bytes split across chunks", async () => {
    const { app } = setup({ maxBodyBytes: 5 });
    app.post("/api/echo", async (c) => c.text(await c.req.text()));
    const tooLarge = await app.request("/api/echo", {
      ...post("abcdef"),
      headers: { "content-length": "6" },
    });
    expect(tooLarge.status).toBe(413);
    const body = new ReadableStream<Uint8Array>({
      start(controller: ReadableStreamDefaultController<Uint8Array>): void {
        for (const chunk of ["ab", "c", "d", "e"]) controller.enqueue(Buffer.from(chunk));
        controller.close();
      },
    });
    expect(
      await (await app.request("/api/echo", { method: "POST", body, duplex: "half" })).text(),
    ).toBe("abcde");
  });

  it("bounds simultaneous authenticated bodies across routes and releases their slots", async () => {
    const { app, cookie } = setup();
    let active = 0;
    const full = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    app.post("/api/hold", async (c) => {
      if (++active === 4) full.resolve();
      await finish.promise;
      return c.text("done");
    });
    app.post("/api/echo", async (c) => c.text(await c.req.text()));
    app.delete("/api/empty", (c) => c.body(null, 204));
    const holding = Array.from({ length: 4 }, () => app.request("/api/hold", post("{}")));
    try {
      await full.promise;
      const busy = await app.request("/api/echo", post("{}"));
      expect(busy.status).toBe(503);
      expect(busy.headers.get("Retry-After")).toBe("1");
      expect((await errorOf(busy)).code).toBe("UNAVAILABLE");
      expect((await app.request("/api/me")).status).toBe(200);
      const headers = { cookie: cookie as string };
      expect(await nodeRequest(app, "DELETE", "/api/empty", headers)).toBe(204);
      expect(
        await nodeRequest(
          app,
          "POST",
          "/api/echo",
          { ...headers, "transfer-encoding": "chunked" },
          "ok",
        ),
      ).toBe(503);
      expect(
        await nodeRequest(app, "POST", "/api/echo", { ...headers, "content-length": "2" }, "ok"),
      ).toBe(503);
      expect((await app.request("/api/invitations/preview", post("{}"))).status).toBe(400);
    } finally {
      finish.resolve();
      await Promise.all(holding);
    }
    expect((await app.request("/api/echo", post("{}"))).status).toBe(200);
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
