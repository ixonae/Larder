import { z } from "zod";
import { idSchema } from "./id.ts";

export const ROLES = ["viewer", "editor", "owner"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** True when `role` grants at least the rights of `required` (viewer < editor < owner). */
export function hasRole(role: Role, required: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(required);
}

export const userSchema = z.object({
  id: idSchema,
  email: z.email(),
  display_name: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const barSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  role: roleSchema,
});
export type BarSummary = z.infer<typeof barSummarySchema>;

/** `GET /api/me` */
export const meSchema = z.object({
  user: userSchema,
  bars: z.array(barSummarySchema),
});
export type Me = z.infer<typeof meSchema>;
