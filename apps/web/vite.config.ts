import { existsSync, lstatSync, readdirSync, readlinkSync, realpathSync, statSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { basename, dirname, join, resolve, sep } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import {
  type Connect,
  defineConfig,
  type Plugin,
  type ResolvedConfig,
  type ViteDevServer,
} from "vite";

const webRoot: string = import.meta.dirname;
const repositoryRoot: string = resolve(webRoot, "../..");
// Vite serves publicDir separately. Keep those files out of the general filesystem middleware.
const allow: string[] = [
  resolve(webRoot, "index.html"),
  resolve(webRoot, "src"),
  resolve(webRoot, "node_modules/.vite"),
  // Vite only adds pnpm's virtual store itself when it lives outside node_modules.
  resolve(repositoryRoot, "node_modules/.pnpm"),
  resolve(repositoryRoot, "packages/shared/src"),
];

function dataPath(): string {
  return resolve(repositoryRoot, process.env.DATA_DIR ?? "data");
}

function pathKey(path: string): string {
  const parent = dirname(path);
  if (path === parent) return realpathSync.native(path);
  if (!lstatSync(path, { throwIfNoEntry: false })) {
    // Use a separate key space for missing components. Two future names may alias, but an
    // existing name and a missing one are already distinguishable on this filesystem.
    return join(pathKey(parent), `\0${basename(path).normalize("NFC").toLowerCase()}`);
  }
  try {
    return realpathSync.native(path);
  } catch (error) {
    // A dangling link starts serving its target as soon as that target is created.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return pathKey(resolve(parent, readlinkSync(path)));
  }
}

function contains(parent: string, path: string): boolean {
  return path === parent || path.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

function requireSeparate(data: string, target: string): void {
  if (contains(target, data) || contains(data, target)) {
    throw new Error(
      "DATA_DIR must be outside the frontend files Vite serves, copies or overwrites.",
    );
  }
}

// Vite follows links when serving and copying public assets, including links in linked directories.
function checkAssetTree(path: string, data: string, visited: Set<string>): void {
  const target = pathKey(path);
  requireSeparate(data, target);
  if (visited.has(target) || !existsSync(target) || !statSync(target).isDirectory()) return;
  visited.add(target);
  for (const name of readdirSync(target)) checkAssetTree(join(target, name), data, visited);
}

/** Whether a dev request would serve a public asset that resolves into the data directory. */
function isPrivateAsset(publicDir: string, base: string, url: string | undefined): boolean {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url ?? "/", "https://vite.invalid").pathname);
  } catch {
    return false;
  }
  // When embedded as middleware, Vite can also serve requests without its configured base.
  const file = join(publicDir, pathname.startsWith(base) ? pathname.slice(base.length) : pathname);
  if (!contains(publicDir, file) || !existsSync(file)) return false;
  return contains(pathKey(dataPath()), realpathSync.native(file));
}

/** Vite adds its own client and package-manager directories while resolving the dev allowlist. */
const privateData: Plugin = {
  name: "larder-private-data",
  configResolved(config: ResolvedConfig): void {
    const data = pathKey(dataPath());
    const roots = new Set(config.command === "serve" ? config.server.fs.allow : []);
    // Preview serves the client outDir, and builds can clear per-output directories as well.
    for (const { build } of Object.values(config.environments)) {
      roots.add(resolve(config.root, build.outDir));
      for (const output of [build.rolldownOptions.output ?? []].flat()) {
        // Vite empties `dir` relative to its root; Rolldown writes it relative to the working directory.
        if (output.dir) roots.add(resolve(config.root, output.dir)).add(resolve(output.dir));
      }
    }
    if (config.publicDir) {
      roots.add(config.publicDir);
      if (existsSync(config.publicDir)) checkAssetTree(config.publicDir, data, new Set());
    }
    for (const root of roots) requireSeparate(data, pathKey(root));
  },
  // Links added to public/ after startup are refused before Vite's public middleware serves them.
  configureServer(server: ViteDevServer): void {
    const { base, publicDir } = server.config;
    if (!publicDir) return;
    function refusePrivateAssets(
      request: Connect.IncomingMessage,
      response: ServerResponse,
      next: Connect.NextFunction,
    ): void {
      if (!isPrivateAsset(publicDir, base, request.url)) {
        next();
        return;
      }
      response.statusCode = 403;
      response.end("Forbidden");
    }
    server.middlewares.use(refusePrivateAssets);
  },
};

export default defineConfig({
  cacheDir: resolve(webRoot, "node_modules/.vite"),
  plugins: [react(), tailwindcss(), privateData],
  resolve: {
    alias: { "@": resolve(webRoot, "src") },
  },
  server: {
    fs: { strict: true, allow },
    proxy: { "/api": process.env.LARDER_API_URL ?? "http://127.0.0.1:3000" },
  },
});
