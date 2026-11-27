import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempDisposableSync, symlinkSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";
import {
  type Connect,
  createServer,
  type InlineConfig,
  isFileLoadingAllowed,
  normalizePath,
  resolveConfig,
  type ViteDevServer,
} from "vite";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import webConfig from "../../vite.config.ts";

const web: string = resolve(import.meta.dirname, "../..");
const config: InlineConfig = { ...webConfig, root: web, configFile: false };
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
    "../../node_modules/.pnpm/react@19.3.1/node_modules/react/index.js",
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

it("checks custom Rolldown output directories relative to the working directory", async () => {
  const root = fixtureDirectory();
  const dir = `larder-missing-output-${randomUUID()}`;
  vi.stubEnv("DATA_DIR", resolve(dir, "state"));
  const build = { rolldownOptions: { output: { dir } } };
  await expect(resolveConfig({ ...config, root, build }, "build")).rejects.toThrow("DATA_DIR");
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

it("checks dangling public links against the data directory they would expose", async () => {
  const root = fixtureDirectory();
  const publicDir = join(root, "public");
  mkdirSync(publicDir);
  symlinkSync(join(root, "missing-artwork"), join(publicDir, "artwork"));
  vi.stubEnv("DATA_DIR", join(root, "state"));
  await expect(resolveConfig({ ...config, publicDir }, "build")).resolves.toHaveProperty(
    "command",
    "build",
  );
  symlinkSync(join(root, "state", "uploads"), join(publicDir, "uploads"));
  await expect(resolveConfig({ ...config, publicDir }, "build")).rejects.toThrow("DATA_DIR");
});

it("follows a dangling data directory link to its future target", async () => {
  const root = fixtureDirectory();
  const publicDir = join(root, "public");
  mkdirSync(publicDir);
  symlinkSync(join(publicDir, "state"), join(root, "state"));
  vi.stubEnv("DATA_DIR", join(root, "state"));
  await expect(resolveConfig({ ...config, publicDir }, "build")).rejects.toThrow("DATA_DIR");
});

it("reports link loops instead of treating them as missing paths", async () => {
  const root = fixtureDirectory();
  symlinkSync(join(root, "b"), join(root, "a"));
  symlinkSync(join(root, "a"), join(root, "b"));
  vi.stubEnv("DATA_DIR", join(root, "a"));
  await expect(resolveConfig({ ...config, publicDir: false }, "build")).rejects.toThrow("ELOOP");
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

async function startServer(overrides: InlineConfig): Promise<ViteDevServer> {
  const server = await createServer({
    ...config,
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true },
    ...overrides,
    server: { ...config.server, middlewareMode: true, ws: false },
  });
  onTestFinished(() => server.close());
  return server;
}

function privateAssetGuard(server: ViteDevServer): Connect.NextHandleFunction | undefined {
  const layer = server.middlewares.stack.find(
    ({ handle }) => typeof handle === "function" && handle.name === "refusePrivateAssets",
  );
  return layer?.handle as Connect.NextHandleFunction | undefined;
}

it("refuses public links into the data directory that are added after startup", async () => {
  const root = fixtureDirectory();
  const publicDir = join(root, "public");
  const state = join(root, "state");
  mkdirSync(publicDir);
  writeFileSync(join(publicDir, "logo.svg"), "<svg/>");
  vi.stubEnv("DATA_DIR", state);
  const guard = privateAssetGuard(await startServer({ root, publicDir, base: "/app/" }));
  expect(guard).toBeDefined();
  mkdirSync(state);
  writeFileSync(join(state, "larder.db"), "private");
  symlinkSync(state, join(publicDir, "state"), "junction");
  const status = (url: string | undefined): number | "next" => {
    const response = { statusCode: 200, end: vi.fn() };
    const next = vi.fn();
    guard?.({ url } as IncomingMessage, response as unknown as ServerResponse, next);
    return next.mock.calls.length > 0 ? "next" : response.statusCode;
  };
  expect(status("/app/state/larder.db")).toBe(403);
  expect(status("/app/state/%6carder.db")).toBe(403);
  for (const url of [
    "/app/logo.svg",
    "/app/missing.svg",
    "/app/..%2f..%2fstate/larder.db",
    "/app/%E0%A4%A",
    "/state/larder.db",
    undefined,
  ]) {
    expect(status(url)).toBe("next");
  }
});

it("adds no public asset guard when the public directory is disabled", async () => {
  const root = fixtureDirectory();
  expect(privateAssetGuard(await startServer({ root, publicDir: false }))).toBeUndefined();
});
