import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./test/app.ts";

let webDir: string;
const bundle = "console.log('Larder');\n".repeat(100);

beforeAll(() => {
  webDir = mkdtempSync(join(tmpdir(), "larder-web-"));
  mkdirSync(join(webDir, "assets"));
  writeFileSync(join(webDir, "index.html"), "<title>Larder</title>");
  writeFileSync(join(webDir, "assets", "app-abc123.js"), "console.log(1)");
  writeFileSync(join(webDir, "assets", "large-abc123.js"), bundle);
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

  it("gzip-compresses cacheable bundles for browsers that accept it", async () => {
    const { app } = createTestApp({ webDir });
    const path = "/assets/large-abc123.js";
    const response = await app.request(path, { headers: { "Accept-Encoding": "gzip" } });
    expect(response.headers.get("Content-Encoding")).toBe("gzip");
    expect(response.headers.get("Vary")).toBe("Accept-Encoding");
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(gunzipSync(Buffer.from(await response.arrayBuffer())).toString()).toBe(bundle);
    const plain = await app.request(path, { headers: { "Accept-Encoding": "gzip;q=0" } });
    expect(plain.headers.get("Content-Encoding")).toBeNull();
    expect(plain.headers.get("Vary")).toBe("Accept-Encoding");
    expect(await plain.text()).toBe(bundle);
  });

  it.each([
    ["gzip", "gzip", null],
    ["*;q=0.5", "gzip", null],
    ["gzip;q=0, *;q=1", null, String(Buffer.byteLength(bundle))],
  ])(
    "uses the same representation for a HEAD and GET accepting %s",
    async (accepted, encoding, length) => {
      const { app } = createTestApp({ webDir });
      const path = "/assets/large-abc123.js";
      const headers = { "Accept-Encoding": accepted };
      const head = await app.request(path, { method: "HEAD", headers });
      const get = await app.request(path, { headers });
      expect(head.status).toBe(get.status);
      expect(head.headers.get("Content-Encoding")).toBe(encoding);
      expect(head.headers.get("Content-Length")).toBe(length);
      for (const name of ["Content-Encoding", "Content-Length", "Vary", "Cache-Control"]) {
        expect(head.headers.get(name)).toBe(get.headers.get(name));
      }
      expect(await head.text()).toBe("");
      await get.arrayBuffer();
    },
  );

  it("varies partial asset responses by encoding for clients requesting identity", async () => {
    const { app } = createTestApp({ webDir });
    const response = await app.request("/assets/large-abc123.js", {
      headers: { "Accept-Encoding": "identity", Range: "bytes=0-31" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Encoding")).toBeNull();
    expect(response.headers.get("Vary")).toBe("Accept-Encoding");
    expect(await response.text()).toBe(bundle.slice(0, 32));
  });

  it("returns the full gzip representation when a client requests a range", async () => {
    const { app } = createTestApp({ webDir });
    const response = await app.request("/assets/large-abc123.js", {
      headers: { "Accept-Encoding": "gzip, identity;q=0", Range: "bytes=0-31" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Encoding")).toBe("gzip");
    expect(response.headers.get("Content-Range")).toBeNull();
    expect(response.headers.get("Vary")).toBe("Accept-Encoding");
    expect(gunzipSync(Buffer.from(await response.arrayBuffer())).toString()).toBe(bundle);
  });

  it("still serves ranges from assets below the compression threshold", async () => {
    const { app } = createTestApp({ webDir });
    const response = await app.request("/assets/app-abc123.js", {
      headers: { "Accept-Encoding": "gzip", Range: "bytes=0-6" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Encoding")).toBeNull();
    expect(await response.text()).toBe("console");
  });

  it("revalidates other static files", async () => {
    const { app } = createTestApp({ webDir });
    const res = await app.request("/favicon.svg");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it.each([
    ["/favicon.ico", "image/x-icon"],
    ["/manifest.webmanifest", "application/manifest+json"],
    ["/service-worker.js", "text/javascript"],
    ["/pwa/apple-touch-icon.png", "image/png"],
  ])("serves and revalidates the web resource %s", async (path, contentType) => {
    const publicDir = fileURLToPath(new URL("../../web/public", import.meta.url));
    const { app } = createTestApp({ webDir: publicDir });
    const res = await app.request(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain(contentType);
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("falls back to index.html for client-side routes", async () => {
    const { app } = createTestApp({ webDir });
    const res = await app.request("/cocktails/123");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<title>Larder</title>");
  });

  it("answers 404 for a missing fingerprinted asset instead of index.html", async () => {
    const { app } = createTestApp({ webDir });
    const res = await app.request("/assets/app-old.js", {
      headers: { "Accept-Encoding": "gzip", Range: "bytes=0-31" },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBeNull();
  });

  it("answers 404 for a retired artwork version instead of serving the SPA", async () => {
    const { app } = createTestApp({ webDir });
    const res = await app.request(`/artwork/v0/${"a".repeat(64)}/small.webp`);
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("decides caching from the URL, not where the files live", async () => {
    const nested = join(webDir, "assets", "web");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "index.html"), "<title>Nested</title>");
    const { app } = createTestApp({ webDir: nested });
    const res = await app.request("/cocktails");
    expect(await res.text()).toBe("<title>Nested</title>");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
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
