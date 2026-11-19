import { createInterface } from "node:readline/promises";
import { hashPassword } from "../auth/password.ts";

export interface Io {
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
  if (process.stdin.isTTY && (await io.readPassword("Repeat: ")) !== password) {
    io.err("The passwords do not match.");
    return 1;
  }
  io.out(await hashPassword(password));
  return 0;
}

/* v8 ignore start -- terminal I/O wiring for the CLI entry point; `main` above is what is tested. */
const terminalIo: Io = {
  async readPassword(prompt) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: Boolean(process.stdin.isTTY),
    });
    if (process.stdin.isTTY) {
      process.stderr.write(prompt);
      // Hide what is typed: echo nothing back.
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
    }
    const line = await rl.question("");
    rl.close();
    if (process.stdin.isTTY) process.stderr.write("\n");
    return line;
  },
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

if (import.meta.main) process.exitCode = await main(terminalIo);
/* v8 ignore stop */
