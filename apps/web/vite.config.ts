import { existsSync, realpathSync } from "node:fs";
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

function physicalPath(path: string): string {
  return existsSync(path) ? realpathSync(path) : join(physicalPath(dirname(path)), basename(path));
}

function contains(parent: string, path: string): boolean {
  return path === parent || path.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

/** Vite adds its own client and package-manager directories while resolving the dev allowlist. */
const privateData: Plugin = {
  name: "larder-private-data",
  configResolved(config: ResolvedConfig): void {
    const data = physicalPath(resolve(repositoryRoot, process.env.DATA_DIR ?? "data"));
    // Vite copies the public directory into production builds and serves it directly in development.
    const roots = config.command === "serve" ? config.server.fs.allow : [];
    for (const root of [...roots, config.publicDir]) {
      if (!root) continue;
      const directory = physicalPath(root);
      if (contains(directory, data) || contains(data, directory)) {
        throw new Error("DATA_DIR must be outside the frontend files Vite serves or publishes.");
      }
    }
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
