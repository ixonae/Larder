import { describe, expect, it } from "vitest";
import { type Env, loadEnv, securityWarnings } from "./env.ts";

const HASH = "scrypt:32768:8:1:BwcHBwcHBwcHBwcHBwcHBw:BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc";

describe("loadEnv", () => {
  it("applies defaults", () => {
    expect(loadEnv({})).toEqual({
      PORT: 3000,
      HOST: "127.0.0.1",
      DATA_DIR: "./data",
      LOG_LEVEL: "info",
      MAX_UPLOAD_MB: 10,
      LARDER_PASSWORD_HASH: undefined,
      WEB_DIR: undefined,
    });
  });

  it("reads and coerces values", () => {
    const env = loadEnv({
      PORT: "8080",
      HOST: "0.0.0.0",
      DATA_DIR: "/data",
      LOG_LEVEL: "debug",
      MAX_UPLOAD_MB: "2.5",
      LARDER_PASSWORD_HASH: HASH,
      WEB_DIR: "/app/web",
    });
    expect(env).toMatchObject({
      PORT: 8080,
      MAX_UPLOAD_MB: 2.5,
      LARDER_PASSWORD_HASH: HASH,
      WEB_DIR: "/app/web",
    });
  });

  it("treats an empty password hash as unset", () => {
    expect(loadEnv({ LARDER_PASSWORD_HASH: "" }).LARDER_PASSWORD_HASH).toBeUndefined();
  });

  it("refuses a password hash in the wrong format", () => {
    expect(() => loadEnv({ LARDER_PASSWORD_HASH: "hunter2" })).toThrow(/pnpm hash-password/);
    expect(() => loadEnv({ LARDER_PASSWORD_HASH: HASH.replace("32768", "32767") })).toThrow(
      /pnpm hash-password/,
    );
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

  it("is quiet when a password is set", () => {
    expect(securityWarnings(env({ HOST: "0.0.0.0", LARDER_PASSWORD_HASH: HASH }))).toEqual([]);
  });

  it("warns on a non-loopback address without a password", () => {
    expect(securityWarnings(env({ HOST: "0.0.0.0" }))).toEqual([
      expect.stringContaining("Listening on 0.0.0.0 without a password"),
    ]);
  });
});
