import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("127.0.0.1"),
  DATA_DIR: z
    .string()
    .min(1)
    .default("./data")
    .transform((value) => resolve(repositoryRoot, value)),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
  LARDER_PUBLIC_URL: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
      const url = URL.parse(value);
      if (
        !url ||
        !/^https?:$/.test(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        ctx.addIssue({
          code: "custom",
          message: "must be an HTTP(S) origin without credentials, a path, query, or fragment",
        });
        return z.NEVER;
      }
      return url.origin;
    }),
  /** Built web app to serve; unset in development, where Vite serves it. */
  WEB_DIR: z
    .string()
    .optional()
    .transform((v) => v || undefined),
});

export type Env = z.infer<typeof envSchema>;

/** Reads and validates configuration from environment variables. Throws a readable error. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid configuration:\n  ${problems.join("\n  ")}`);
  }
  return result.data;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

/** Startup warnings about risky configuration. */
export function securityWarnings(env: Env): string[] {
  if (env.LARDER_PUBLIC_URL?.startsWith("https://") || LOOPBACK.has(env.HOST)) return [];
  return [
    `Listening on ${env.HOST} with Secure cookies disabled. Set LARDER_PUBLIC_URL to your HTTPS origin.`,
  ];
}
