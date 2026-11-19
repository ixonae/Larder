import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashes look like `scrypt:<N>:<r>:<p>:<salt>:<key>` (salt and key in base64url).
 * Colons rather than `$` so the value can be pasted into a shell or a compose `.env` file unquoted.
 */
export const PASSWORD_HASH_PATTERN = /^scrypt:\d+:\d+:\d+:[\w-]+:[\w-]+$/;

const COST = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
/** Shorter salts or keys are refused: a 0-byte key would match any password. */
const MIN_STORED_BYTES = 8;
const MAX_MEM = 128 * 1024 * 1024;

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
) => Promise<Buffer>;

type Cost = { N: number; r: number; p: number };
interface ParsedHash {
  cost: Cost;
  salt: Buffer;
  key: Buffer;
}

const derive = (password: string, salt: Buffer, keyLength: number, cost: Cost) =>
  scryptAsync(password, salt, keyLength, { ...cost, maxmem: MAX_MEM });

const isPowerOfTwo = (n: number) => Number.isSafeInteger(n) && n > 1 && (n & (n - 1)) === 0;

function parseHash(stored: string): ParsedHash | undefined {
  if (!PASSWORD_HASH_PATTERN.test(stored)) return undefined;
  const [, N, r, p, salt, key] = stored.split(":") as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const cost = { N: Number(N), r: Number(r), p: Number(p) };
  const parsed = {
    cost,
    salt: Buffer.from(salt, "base64url"),
    key: Buffer.from(key, "base64url"),
  };
  const valid =
    isPowerOfTwo(cost.N) &&
    cost.r >= 1 &&
    cost.p >= 1 &&
    parsed.salt.length >= MIN_STORED_BYTES &&
    parsed.key.length >= MIN_STORED_BYTES;
  return valid ? parsed : undefined;
}

/** Whether `value` is a well-formed hash from `hashPassword` (format, cost parameters and lengths). */
export const isPasswordHash = (value: string): boolean => parseHash(value) !== undefined;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, KEY_LENGTH, COST);
  const { N, r, p } = COST;
  return ["scrypt", N, r, p, salt.toString("base64url"), key.toString("base64url")].join(":");
}

/** Constant-time check of `password` against a stored hash. Malformed hashes never match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  try {
    const actual = await derive(password, parsed.salt, parsed.key.length, parsed.cost);
    return timingSafeEqual(actual, parsed.key);
  } catch {
    return false; // cost parameters scrypt refuses, e.g. above the memory limit
  }
}
