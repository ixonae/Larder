import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./test/app.ts";

let webDir: string;

beforeAll(() => {
  webDir = mkdtempSync(join(tmpdir(), "larder-web-"));
  mkdirSync(join(webDir, "assets"));
  writeFileSync(join(webDir, "index.html"), "<title>Larder</title>");
  writeFileSync(join(webDir, "assets", "app-abc123.js"), "console.log(1)");
  writeFileSync(join(webDir, "favicon.svg"), "<svg/>");
});

describe("web app serving", () => {
  it("serves index.html at the root without long caching", async () => {
    const { app } = createTestApp({ webDir });
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<title>Larder</title>");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("caches fingerprinted assets for a year", async () => {
    const { app } = createTestApp({ webDir });
    const res = await app.request("/assets/app-abc123.js");
    expect(await res.text()).toBe("console.log(1)");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });

  it("revalidates other static files", async () => {
    const { app } = createTestApp({ webDir });
    const res = await app.request("/favicon.svg");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("falls back to index.html for client-side routes", async () => {
    const { app } = createTestApp({ webDir });
    const res = await app.request("/cocktails/123");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<title>Larder</title>");
  });

  it.each(["/api/nope", "/api"])("keeps the JSON 404 for %s", async (path) => {
    const { app } = createTestApp({ webDir });
    const res = await app.request(path);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });

  it("still serves the API", async () => {
    const { app } = createTestApp({ webDir });
    expect((await app.request("/api/health")).status).toBe(200);
  });

  it("answers 404 when the web app is missing", async () => {
    const { app } = createTestApp({ webDir: join(webDir, "missing") });
    expect((await app.request("/cocktails")).status).toBe(404);
  });
});
