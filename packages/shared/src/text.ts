import { z } from "zod";

/** Trimmed optional text, at most `max` characters; blank is stored as `null`. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null)
    .nullable();
