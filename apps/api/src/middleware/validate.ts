import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";
import { invalid } from "../errors.ts";

/** `zValidator` that reports failures in the shared error shape (code `VALIDATION`). */
// biome-ignore lint/nursery/useExplicitType: The Zod validator infers middleware input and output from the target and schema.
export const validate = <T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      throw invalid(`Invalid ${target}`, result.error.issues);
    }
  });
