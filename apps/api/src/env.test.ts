import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type Env, loadEnv, securityWarnings } from "./env.ts";

describe("loadEnv", () => {
  it("applies defaults", () => {
    expect(loadEnv({})).toEqual({
      PORT: 3000,
      HOST: "127.0.0.1",
      DATA_DIR: fileURLToPath(new URL("../../../data", import.meta.url)),
      LOG_LEVEL: "info",
      MAX_UPLOAD_MB: 10,
      LARDER_PUBLIC_URL: undefined,
      WEB_DIR: undefined,
    });
  });

  it("reads and coerces values, and normalizes the public origin", () => {
    const env = loadEnv({
      PORT: "8080",
      HOST: "0.0.0.0",
      DATA_DIR: "/data",
      LOG_LEVEL: "debug",
      MAX_UPLOAD_MB: "2.5",
      LARDER_PUBLIC_URL: "https://Bar.example.test:443/",
      WEB_DIR: "/app/web",
    });
    expect(env).toMatchObject({
      PORT: 8080,
      MAX_UPLOAD_MB: 2.5,
      LARDER_PUBLIC_URL: "https://bar.example.test",
      WEB_DIR: "/app/web",
    });
  });

  it("accepts only a single trusted proxy IP and treats an empty setting as unset", () => {
    expect(loadEnv({ LARDER_TRUSTED_PROXY: "" }).LARDER_TRUSTED_PROXY).toBeUndefined();
    for (const ip of ["192.0.2.1", "2001:db8::1"]) {
      expect(loadEnv({ LARDER_TRUSTED_PROXY: ip }).LARDER_TRUSTED_PROXY).toBe(ip);
    }
    expect(() => loadEnv({ LARDER_TRUSTED_PROXY: "proxy.example" })).toThrow(
      "LARDER_TRUSTED_PROXY",
    );
  });

  it("treats an empty public URL as unset", () => {
    expect(loadEnv({ LARDER_PUBLIC_URL: "" }).LARDER_PUBLIC_URL).toBeUndefined();
  });

  it.each([
    "example.test",
    "ftp://example.test",
    "https://login@example.test",
    "https://:password@example.test",
    "https://example.test/app",
    "https://example.test?q=one",
    "https://example.test#fragment",
  ])("rejects invalid public origin %s", (LARDER_PUBLIC_URL) => {
    expect(() => loadEnv({ LARDER_PUBLIC_URL })).toThrow(/LARDER_PUBLIC_URL/);
  });

  it("lists every invalid variable", () => {
    expect(() => loadEnv({ PORT: "abc", LOG_LEVEL: "loud" })).toThrow(/PORT[\s\S]*LOG_LEVEL/);
  });
});

describe("securityWarnings", () => {
  const base = loadEnv({});
  const env = (over: Partial<Env>): Env => ({ ...base, ...over });

  it.each(["127.0.0.1", "::1", "localhost"])("is quiet on loopback %s", (HOST) => {
    expect(securityWarnings(env({ HOST }))).toEqual([]);
  });

  it("is quiet when a public HTTPS origin is configured", () => {
    expect(
      securityWarnings(env({ HOST: "0.0.0.0", LARDER_PUBLIC_URL: "https://bar.example.test" })),
    ).toEqual([]);
  });

  it("warns on a non-loopback address without secure cookies", () => {
    expect(securityWarnings(env({ HOST: "0.0.0.0" }))).toEqual([
      expect.stringContaining("Listening on 0.0.0.0 with Secure cookies disabled"),
    ]);
  });
});

it("resolves relative data directories from the repository root", () => {
  expect(loadEnv({ DATA_DIR: "apps/api/data" }).DATA_DIR).toBe(
    fileURLToPath(new URL("../data", import.meta.url)),
  );
});
