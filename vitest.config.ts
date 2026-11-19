import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["{apps,packages}/*/vitest.config.ts"],
    coverage: {
      provider: "v8",
      include: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
      // Allowed exclusions only (see AGENTS.md, Testing).
      // Anything else needs a `/* v8 ignore next */` with a reason, called out in the PR.
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "apps/web/src/components/ui/**",
        "apps/api/src/db/migrations/**",
        "apps/api/src/server.ts",
        "apps/web/src/main.tsx",
      ],
      reporter: ["text", "html", "lcov"],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
