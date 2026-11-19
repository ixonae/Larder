import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { hashPassword } from "../auth/password.ts";

export interface Io {
  /** On a terminal the password is asked twice; piped input is read once. */
  interactive: boolean;
  /** Reads the password: hidden prompt on a terminal, otherwise the first line of stdin. */
  readPassword(prompt: string): Promise<string>;
  out(line: string): void;
  err(line: string): void;
}

export const MIN_LENGTH = 12;

/** `pnpm hash-password`: prints a value for LARDER_PASSWORD_HASH. Returns the exit code. */
export async function main(io: Io): Promise<number> {
  const password = await io.readPassword("Password: ");
  if (password.length < MIN_LENGTH) {
    io.err(`Use at least ${MIN_LENGTH} characters.`);
    return 1;
  }
  if (io.interactive && (await io.readPassword("Repeat: ")) !== password) {
    io.err("The passwords do not match.");
    return 1;
  }
  io.out(await hashPassword(password));
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

if (import.meta.main) process.exitCode = await main(terminalIo);
/* v8 ignore stop */
