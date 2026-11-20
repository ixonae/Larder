import { z } from "zod";

/** Trimmed optional text, at most `max` characters; blank is stored as `null`. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null)
    .nullable();

/** The key two names are the same by: Unicode NFC and locale-independent lowercase, accents kept. */
export const nameKey = (name: string) => name.normalize("NFC").toLowerCase().normalize("NFC");

/** A looser key for search as you type: case- and accent-insensitive, so "creme" finds "Crème". */
export const searchKey = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
