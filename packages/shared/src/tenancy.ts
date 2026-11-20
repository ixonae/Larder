import { z } from "zod";
import { currencySchema, DEFAULT_CURRENCY } from "./currency.ts";
import { idSchema } from "./id.ts";

export const ROLES = ["viewer", "editor", "owner"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** True when `role` grants at least the rights of `required` (viewer < editor < owner). */
export function hasRole(role: Role, required: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(required);
}

/** Public identity for attributed bar activity. */
export const authorSchema = z.object({
  id: idSchema,
  display_name: z.string(),
});

export const userSchema = authorSchema.extend({ email: z.email(), is_admin: z.boolean() });
export type User = z.infer<typeof userSchema>;

export const barSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  /** ISO 4217 code that prices in this bar are given in. */
  currency: currencySchema,
  role: roleSchema,
});
export type BarSummary = z.infer<typeof barSummarySchema>;

/** `GET /api/me` */
export const meSchema = z.object({
  user: userSchema,
  bars: z.array(barSummarySchema),
});
export type Me = z.infer<typeof meSchema>;

/** What an owner can set on a bar. */
export const barFieldsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  currency: currencySchema,
});

export const createBarSchema = barFieldsSchema.extend({
  currency: currencySchema.default(DEFAULT_CURRENCY),
  seed_data: z.boolean().default(false),
});
export type CreateBar = z.output<typeof createBarSchema>;

/** `PATCH /api/bars/:barId`: the owner changes the name, the currency, or both. */
export const updateBarSchema = barFieldsSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Send at least one field to change");
export type UpdateBar = z.output<typeof updateBarSchema>;
export const deleteBarSchema = z.object({ name: z.string().min(1) });

export const barMemberSchema = authorSchema.extend({ role: roleSchema });
export type BarMember = z.infer<typeof barMemberSchema>;
export const barMembersSchema = z.object({ members: z.array(barMemberSchema) });

export const adminUserSchema = userSchema.extend({
  disabled: z.boolean(),
  last_login_at: z.iso.datetime().nullable(),
});
export type AdminUser = z.output<typeof adminUserSchema>;
export const adminUsersSchema = z.object({ users: z.array(adminUserSchema) });
export const userAccessSchema = adminUserSchema.pick({ disabled: true });
export const deleteUserSchema = userSchema.pick({ email: true });

export const adminBarSchema = barSummarySchema
  .omit({ role: true, currency: true })
  .extend({ owner: authorSchema });
export type AdminBar = z.output<typeof adminBarSchema>;
export const adminBarsSchema = z.object({ bars: z.array(adminBarSchema) });
