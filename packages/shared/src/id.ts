import { z } from "zod";

/** Any UUID string; ids we generate are always UUIDv7. */
export const idSchema = z.uuid();
export type Id = z.infer<typeof idSchema>;

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Formats a UUIDv7 (RFC 9562): 48-bit Unix ms timestamp, 12-bit sequence in `rand_a`,
 * then 62 random bits. `random` must hold at least 8 bytes.
 */
export function formatUuidV7(ms: number, seq: number, random: Uint8Array): string {
  const bytes = new Uint8Array(16);
  let ts = ms;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = 0x70 | ((seq >> 8) & 0x0f); // version 7 + high bits of the sequence
  bytes[7] = seq & 0xff;
  bytes.set(random.subarray(0, 8), 8);
  // biome-ignore lint/style/noNonNullAssertion: fixed-size array, index always exists
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 9562 variant
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const MAX_SEQ = 0xfff;
let lastMs = Number.NEGATIVE_INFINITY;
let lastSeq = 0;

/**
 * Returns a new UUIDv7. Ids are strictly increasing within a process, even when several are created
 * in the same millisecond (RFC 9562 "fixed bit-length dedicated counter" method), so sorting by id
 * gives creation order and keeps SQLite indexes compact.
 */
export function newId(): string {
  const now = Date.now();
  const random = crypto.getRandomValues(new Uint8Array(10));
  if (now > lastMs) {
    lastMs = now;
    // Start in the lower half of the range to leave room for ids created in the same millisecond.
    lastSeq = (((random[8] as number) << 8) % 0x800) | (random[9] as number);
  } else if (lastSeq < MAX_SEQ) {
    lastSeq++;
  } else {
    lastMs++; // Counter exhausted (or clock went back): borrow the next millisecond.
    lastSeq = 0;
  }
  return formatUuidV7(lastMs, lastSeq, random);
}
