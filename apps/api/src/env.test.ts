import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.ts";

describe("loadEnv", () => {
  it("applies defaults", () => {
    expect(loadEnv({})).toEqual({
      PORT: 3000,
      HOST: "127.0.0.1",
      DATA_DIR: "./data",
      LOG_LEVEL: "info",
      MAX_UPLOAD_MB: 10,
      LARDER_PASSWORD_HASH: undefined,
    });
  });

  it("reads and coerces values", () => {
    const env = loadEnv({
      PORT: "8080",
      HOST: "0.0.0.0",
      DATA_DIR: "/data",
      LOG_LEVEL: "debug",
      MAX_UPLOAD_MB: "2.5",
      LARDER_PASSWORD_HASH: "scrypt$abc",
    });
    expect(env).toMatchObject({
      PORT: 8080,
      MAX_UPLOAD_MB: 2.5,
      LARDER_PASSWORD_HASH: "scrypt$abc",
    });
  });

  it("treats an empty password hash as unset", () => {
    expect(loadEnv({ LARDER_PASSWORD_HASH: "" }).LARDER_PASSWORD_HASH).toBeUndefined();
  });

  it("lists every invalid variable", () => {
    expect(() => loadEnv({ PORT: "abc", LOG_LEVEL: "loud" })).toThrow(/PORT[\s\S]*LOG_LEVEL/);
  });
});
