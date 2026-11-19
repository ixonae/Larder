import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashes look like `scrypt:<N>:<r>:<p>:<salt>:<key>` (salt and key in base64url).
 * Colons rather than `$` so the value can be pasted into a shell or a compose `.env` file unquoted.
 */
export const PASSWORD_HASH_PATTERN = /^scrypt:\d+:\d+:\d+:[\w-]+:[\w-]+$/;

const COST = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 32;
const MAX_MEM = 128 * 1024 * 1024;

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const derive = (
  password: string,
  salt: Buffer,
  keyLength: number,
  cost: { N: number; r: number; p: number },
) => scryptAsync(password, salt, keyLength, { ...cost, maxmem: MAX_MEM });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LENGTH, COST);
  const { N, r, p } = COST;
  return ["scrypt", N, r, p, salt.toString("base64url"), key.toString("base64url")].join(":");
}

/** Constant-time check of `password` against a stored hash. Malformed hashes never match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!PASSWORD_HASH_PATTERN.test(stored)) return false;
  const [, N, r, p, salt, key] = stored.split(":") as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const expected = Buffer.from(key, "base64url");
  try {
    const actual = await derive(password, Buffer.from(salt, "base64url"), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false; // invalid cost parameters
  }
}
