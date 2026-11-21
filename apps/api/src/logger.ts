import type { LogLevel } from "./env.ts";

export type LogFields = Record<string, unknown>;
export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

/** Structured logger writing one JSON object per line. */
export function createLogger(
  level: LogLevel,
  write: (line: string) => void = (line: string) => process.stdout.write(`${line}\n`),
): Logger {
  const log =
    (lvl: Exclude<LogLevel, "silent">) =>
    (msg: string, fields: LogFields = {}): void => {
      if (RANK[lvl] < RANK[level]) return;
      const core = { time: new Date().toISOString(), level: lvl, msg };
      // Core keys come first in the line and cannot be overwritten by a field of the same name.
      write(JSON.stringify({ ...core, ...fields, ...core }));
    };
  return { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") };
}
