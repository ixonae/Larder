import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ResolvedConfig } from "vite";

const webRoot: string = import.meta.dirname;
const repositoryRoot = resolve(webRoot, "../..");
const allow: string[] = [
  resolve(webRoot, "index.html"),
  resolve(webRoot, "src"),
  resolve(webRoot, "public"),
  resolve(webRoot, "node_modules/.vite"),
  resolve(repositoryRoot, "packages/shared/src"),
];

function pathKey(path: string): string {
  const parent = dirname(path);
  if (path === parent || lstatSync(path, { throwIfNoEntry: false }))
    return realpathSync.native(path);
  // Use a separate key space for missing components. Two future names may alias, but an
  // existing name and a missing one are already distinguishable on this filesystem.
  return join(pathKey(parent), `\0${basename(path).normalize("NFC").toLowerCase()}`);
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
  const target = realpathSync.native(path);
  requireSeparate(data, target);
  if (visited.has(target) || !statSync(target).isDirectory()) return;
  visited.add(target);
  for (const name of readdirSync(target)) checkAssetTree(join(target, name), data, visited);
}

/** Vite adds its own client and package-manager directories while resolving the dev allowlist. */
const privateData: Plugin = {
  name: "larder-private-data",
  configResolved(config: ResolvedConfig): void {
    const data = pathKey(resolve(repositoryRoot, process.env.DATA_DIR ?? "data"));
    const roots = new Set(config.command === "serve" ? config.server.fs.allow : []);
    // Preview serves the client outDir, and builds can clear per-output directories as well.
    for (const { build } of Object.values(config.environments)) {
      roots.add(resolve(config.root, build.outDir));
      for (const output of [build.rolldownOptions.output ?? []].flat()) {
        if (output.dir) roots.add(resolve(config.root, output.dir));
      }
    }
    if (config.publicDir) {
      roots.add(config.publicDir);
      if (existsSync(config.publicDir)) checkAssetTree(config.publicDir, data, new Set());
    }
    for (const root of roots) requireSeparate(data, pathKey(root));
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
