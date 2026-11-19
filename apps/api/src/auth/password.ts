import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashes look like `scrypt:<N>:<r>:<p>:<salt>:<key>` (salt and key in base64url).
 * Colons rather than `$` so the value can be pasted into a shell or a compose `.env` file unquoted.
 */
const COST = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const PREFIX = `scrypt:${COST.N}:${COST.r}:${COST.p}:`;
// Fixed lengths bound the decoder input to the format produced by hashPassword.
export const PASSWORD_HASH_PATTERN = new RegExp(
  `^${PREFIX}([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{43})$`,
);

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: typeof COST,
) => Promise<Buffer>;

function parseHash(stored: string) {
  const match = PASSWORD_HASH_PATTERN.exec(stored);
  if (!match) return undefined;
  // Both capture groups are mandatory.
  const saltText = match[1] as string;
  const keyText = match[2] as string;
  const salt = Buffer.from(saltText, "base64url");
  const key = Buffer.from(keyText, "base64url");
  if (salt.toString("base64url") !== saltText || key.toString("base64url") !== keyText)
    return undefined;
  return { salt, key };
}

export const isPasswordHash = (value: string): boolean => parseHash(value) !== undefined;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password, salt, KEY_LENGTH, COST);
  return `${PREFIX}${salt.toString("base64url")}:${key.toString("base64url")}`;
}

/** Constant-time check of `password` against a stored hash. Malformed hashes never match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const actual = await scryptAsync(password, parsed.salt, KEY_LENGTH, COST);
  return timingSafeEqual(actual, parsed.key);
}
