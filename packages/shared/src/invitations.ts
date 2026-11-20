import { z } from "zod";
import { newAccountSchema } from "./auth.ts";
import { idSchema } from "./id.ts";

export const INVITATION_ROLES = ["viewer", "editor"] as const;
export const invitationRoleSchema = z.enum(INVITATION_ROLES);
export const createInvitationSchema = z.object({ role: invitationRoleSchema });
export type CreateInvitation = z.output<typeof createInvitationSchema>;
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const acceptInvitationSchema = z.object({ token: invitationTokenSchema });
export const registerByInvitationSchema = newAccountSchema.extend(acceptInvitationSchema.shape);
export type RegisterByInvitation = z.output<typeof registerByInvitationSchema>;

export const pendingInvitationSchema = createInvitationSchema.extend({
  id: idSchema,
  expires_at: z.iso.datetime(),
});
export type PendingInvitation = z.output<typeof pendingInvitationSchema>;
export const pendingInvitationsSchema = z.object({ invitations: z.array(pendingInvitationSchema) });

export const invitationLinkSchema = pendingInvitationSchema.extend({ url: z.url() });
export const invitationPreviewSchema = createInvitationSchema.extend({
  bar_name: z.string(),
  can_register: z.boolean(),
  expires_at: z.iso.datetime(),
});
