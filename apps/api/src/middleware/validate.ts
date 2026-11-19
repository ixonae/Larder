import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";
import { AppError } from "../errors.ts";

/** `zValidator` that reports failures in the shared error shape (code `VALIDATION`). */
export const validate = <T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new AppError("VALIDATION", `Invalid ${target}`, result.error.issues);
    }
  });
