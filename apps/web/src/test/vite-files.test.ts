import { parse, resolve } from "node:path";
import { isFileLoadingAllowed, resolveConfig } from "vite";
import { afterEach, expect, it, vi } from "vitest";
import webConfig from "../../vite.config.ts";

const web = resolve(import.meta.dirname, "../..");
const config = { ...webConfig, root: web, configFile: false } as const;
afterEach(() => vi.unstubAllEnvs());

it("allows frontend modules and shared dependencies while excluding Larder data", async () => {
  vi.stubEnv("DATA_DIR", undefined);
  const resolved = await resolveConfig(config, "serve");
  for (const file of [
    "src/main.tsx",
    "../../packages/shared/src/index.ts",
    "node_modules/.vite/deps/react.js",
  ]) {
    expect(isFileLoadingAllowed(resolved, resolve(web, file))).toBe(true);
  }
  for (const file of [
    "../../data/larder.db",
    "../../data/uploads/example.webp",
    "../api/data/larder.db",
    "../../custom-state/example.webp",
  ]) {
    expect(isFileLoadingAllowed(resolved, resolve(web, file))).toBe(false);
  }
});

it.each([
  "apps/web/public/state",
  "apps/web/public",
  "packages/shared/src/state",
  ".",
  parse(web).root,
])(
  "refuses to serve when the configured data directory overlaps frontend files (%s)",
  async (path) => {
    vi.stubEnv("DATA_DIR", path);
    await expect(resolveConfig(config, "serve")).rejects.toThrow("DATA_DIR");
  },
);

it("checks the final allowlist, including the client directory added by Vite", async () => {
  const viteClient = resolve(web, "node_modules/vite/dist/client/state");
  vi.stubEnv("DATA_DIR", viteClient);
  await expect(resolveConfig(config, "serve")).rejects.toThrow("DATA_DIR");
});

it("prevents production builds from copying the data directory into public assets", async () => {
  vi.stubEnv("DATA_DIR", "apps/web/public/private-data");
  await expect(resolveConfig(config, "build")).rejects.toThrow("DATA_DIR");
  vi.stubEnv("DATA_DIR", "data");
  await expect(resolveConfig(config, "build")).resolves.toHaveProperty("command", "build");
});

it("does not treat a disabled public directory as a build input", async () => {
  vi.stubEnv("DATA_DIR", "apps/web/public/private-data");
  await expect(resolveConfig({ ...config, publicDir: false }, "build")).resolves.toHaveProperty(
    "publicDir",
    "",
  );
});

it("uses the configured API origin for the development proxy", async () => {
  vi.stubEnv("LARDER_API_URL", "http://localhost:4310");
  vi.resetModules();
  const { default: overridden } = await import("../../vite.config.ts");
  expect(overridden.server?.proxy?.["/api"]).toBe("http://localhost:4310");
});
