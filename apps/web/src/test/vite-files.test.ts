import { existsSync, mkdirSync, mkdtempDisposableSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";
import { isFileLoadingAllowed, normalizePath, resolveConfig } from "vite";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import webConfig from "../../vite.config.ts";

const web = resolve(import.meta.dirname, "../..");
const config = { ...webConfig, root: web, configFile: false } as const;
afterEach(() => vi.unstubAllEnvs());

function fixtureDirectory(): string {
  const fixture = mkdtempDisposableSync(join(tmpdir(), "larder-vite-"));
  onTestFinished(() => fixture.remove());
  return fixture.path;
}

it("allows frontend modules and shared dependencies while excluding Larder data", async () => {
  vi.stubEnv("DATA_DIR", undefined);
  const resolved = await resolveConfig(config, "serve");
  for (const file of [
    "src/main.tsx",
    "../../packages/shared/src/index.ts",
    "node_modules/.vite/deps/react.js",
  ]) {
    expect(isFileLoadingAllowed(resolved, normalizePath(resolve(web, file)))).toBe(true);
  }
  for (const file of [
    "../../data/larder.db",
    "../../data/uploads/example.webp",
    "../api/data/larder.db",
    "../../custom-state/example.webp",
  ]) {
    expect(isFileLoadingAllowed(resolved, normalizePath(resolve(web, file)))).toBe(false);
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

it("protects private data from build cleanup and preview serving", async () => {
  vi.stubEnv("DATA_DIR", "apps/web/dist/state");
  await expect(resolveConfig(config, "build")).rejects.toThrow("DATA_DIR");
  await expect(resolveConfig(config, "serve", "production", "production", true)).rejects.toThrow(
    "DATA_DIR",
  );
});

it("checks custom output directories relative to the Vite root", async () => {
  const root = fixtureDirectory();
  vi.stubEnv("DATA_DIR", join(root, "state"));
  const build = { outDir: "state/frontend" };
  await expect(resolveConfig({ ...config, root, build }, "build")).rejects.toThrow("DATA_DIR");
  const rolldownOptions = { output: [{}, { dir: "state" }] };
  await expect(
    resolveConfig({ ...config, root, build: { rolldownOptions } }, "build"),
  ).rejects.toThrow("DATA_DIR");
});

it.each(["build", "serve"] as const)("checks nested public symlinks before %s", async (command) => {
  const root = fixtureDirectory();
  const publicDir = join(root, "public");
  const artwork = join(root, "artwork");
  const state = join(root, "state");
  for (const dir of [publicDir, artwork, state]) mkdirSync(dir);
  writeFileSync(join(artwork, "label.svg"), "<svg/>");
  symlinkSync(artwork, join(publicDir, "labels"), "junction");
  symlinkSync(artwork, join(publicDir, "more-labels"), "junction");
  vi.stubEnv("DATA_DIR", state);
  await expect(resolveConfig({ ...config, publicDir }, command)).resolves.toHaveProperty(
    "command",
    command,
  );
  symlinkSync(state, join(artwork, "archive"), "junction");
  await expect(resolveConfig({ ...config, publicDir }, command)).rejects.toThrow("DATA_DIR");
});

it("compares existing paths using the filesystem's actual casing", async () => {
  const root = fixtureDirectory();
  const publicDir = join(root, "public");
  mkdirSync(publicDir);
  const alternate = join(root, "PUBLIC");
  vi.stubEnv("DATA_DIR", join(alternate, "state"));
  const result = resolveConfig({ ...config, publicDir }, "build");
  if (existsSync(alternate)) await expect(result).rejects.toThrow("DATA_DIR");
  else await expect(result).resolves.toHaveProperty("command", "build");
});

it("protects not-yet-created output and data directories with ambiguous casing", async () => {
  const root = fixtureDirectory();
  vi.stubEnv("DATA_DIR", join(root, "Artifacts", "state"));
  await expect(
    resolveConfig({ ...config, root, build: { outDir: "artifacts" } }, "build"),
  ).rejects.toThrow("DATA_DIR");
});

it("uses the configured API origin for the development proxy", async () => {
  vi.stubEnv("LARDER_API_URL", "http://localhost:4310");
  vi.resetModules();
  const { default: overridden } = await import("../../vite.config.ts");
  expect(overridden.server?.proxy?.["/api"]).toBe("http://localhost:4310");
});
