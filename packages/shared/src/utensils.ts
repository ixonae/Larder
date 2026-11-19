import { z } from "zod";
import { DESCRIPTION_MAX } from "./categories.ts";
import { idSchema } from "./id.ts";
import { paginationQuerySchema } from "./pagination.ts";
import { optionalText } from "./text.ts";

export const UTENSIL_KINDS = ["glass", "tool"] as const;
export const utensilKindSchema = z.enum(UTENSIL_KINDS);
export type UtensilKind = z.infer<typeof utensilKindSchema>;

export const UTENSIL_KIND_LABEL: Record<UtensilKind, string> = { glass: "Glass", tool: "Tool" };
/** Group headings in lists. */
export const UTENSIL_KIND_PLURAL: Record<UtensilKind, string> = { glass: "Glasses", tool: "Tools" };

export const UTENSIL_NAME_MAX = 100;
export const CAPACITY_ML_MAX = 5000;

/** A glass or a bar tool (shaker, jigger, strainer…). */
export const utensilSchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: utensilKindSchema,
  /** Glasses only; `null` for tools. */
  capacity_ml: z.number().nullable(),
  description: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Utensil = z.infer<typeof utensilSchema>;

const fields = {
  name: z.string().trim().min(1).max(UTENSIL_NAME_MAX),
  kind: utensilKindSchema,
  /** Only for glasses; a tool always has `null`. */
  capacity_ml: z.number().positive().max(CAPACITY_ML_MAX).nullable(),
  description: optionalText(DESCRIPTION_MAX),
};

/** `POST /utensils` */
export const createUtensilSchema = z.object(fields).partial().required({ name: true, kind: true });
export type CreateUtensil = z.infer<typeof createUtensilSchema>;

/** `PATCH /utensils/:id`: only the fields sent change. */
export const updateUtensilSchema = z
  .object(fields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Send at least one field to change");
export type UpdateUtensil = z.infer<typeof updateUtensilSchema>;

/** `GET /utensils`: a page sorted by name. */
export const listUtensilsQuerySchema = paginationQuerySchema.extend({
  /** Matches anywhere in the name, ignoring case. */
  q: z.string().trim().min(1).max(UTENSIL_NAME_MAX).optional(),
  kind: utensilKindSchema.optional(),
});
export type ListUtensilsQuery = z.infer<typeof listUtensilsQuerySchema>;
