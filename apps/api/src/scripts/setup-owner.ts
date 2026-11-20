import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, newAccountSchema } from "@larder/shared";
import { hashPassword } from "../auth/password.ts";
import { ensureOwner } from "../auth/service.ts";
import { type Db, openDb } from "../db/client.ts";
import { runMigrations } from "../db/migrate.ts";
import { loadEnv } from "../env.ts";

export interface Io {
  /** On a terminal the password is asked twice; piped input is read once. */
  interactive: boolean;
  /** Reads the password: hidden prompt on a terminal, otherwise the first line of stdin. */
  readPassword(prompt: string): Promise<string>;
  out(line: string): void;
  err(line: string): void;
}

/** Initializes the owner credential, or replaces it on an explicit reset. */
export async function main(io: Io, db: Db, reset = false): Promise<number> {
  const password = await io.readPassword("Password: ");
  if (!newAccountSchema.shape.password.safeParse(password).success) {
    io.err(`Use ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`);
    return 1;
  }
  if (io.interactive && (await io.readPassword("Repeat: ")) !== password) {
    io.err("The passwords do not match.");
    return 1;
  }
  const passwordHash = await hashPassword(password);
  const email = ensureOwner(db, passwordHash, reset);
  if (!email) {
    io.err("The owner account is already set up. Use --reset to replace its password.");
    return 1;
  }
  io.out(`Owner account ready. Sign in as ${email}.`);
  return 0;
}

/**
 * A stream that forwards to `target` until `mute()` is called. readline echoes what is typed to its
 * output, so muting it right after the prompt is written hides the password (public API only).
 */
export function muteableOutput(target: NodeJS.WritableStream) {
  let muted = false;
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) target.write(chunk);
      callback();
    },
  });
  return {
    stream,
    mute: () => {
      muted = true;
    },
  };
}

/* v8 ignore start -- terminal I/O wiring for the CLI entry point; `main` above is what is tested. */
const terminalIo: Io = {
  interactive: Boolean(process.stdin.isTTY),
  async readPassword(prompt) {
    if (!process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, terminal: false });
      const line = await rl.question("");
      rl.close();
      return line;
    }
    const output = muteableOutput(process.stderr);
    const rl = createInterface({ input: process.stdin, output: output.stream, terminal: true });
    const answer = rl.question(prompt); // writes the prompt synchronously, before muting
    output.mute();
    const line = await answer;
    rl.close();
    process.stderr.write("\n");
    return line;
  },
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--reset")) {
    throw new Error("Usage: setup-owner [--reset]");
  }
  const { DATA_DIR } = loadEnv();
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const db = openDb(join(DATA_DIR, "larder.db"));
  try {
    runMigrations(db);
    process.exitCode = await main(terminalIo, db, args[0] === "--reset");
  } finally {
    db.$client.close();
  }
}
/* v8 ignore stop */
