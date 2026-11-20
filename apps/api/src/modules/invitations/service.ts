import {
  type BarSummary,
  type invitationPreviewSchema,
  nowIso,
  type RegisterByInvitation,
} from "@larder/shared";
import type { z } from "zod";
import { hashPassword } from "../../auth/password.ts";
import {
  canRegister,
  createAccount,
  requireRegistration,
  startSession,
} from "../../auth/service.ts";
import { hashToken, newToken } from "../../auth/token.ts";
import type { Db, Executor, Tx } from "../../db/client.ts";
import { conflict, notFound, parseId } from "../../errors.ts";
import type { Ctx } from "../../types.ts";
import * as repo from "./repo.ts";

const INVITATION_TTL = 7 * 24 * 60 * 60 * 1000;

export function invite({ db, barId, userId }: Ctx, role: repo.InvitationRow["role"]) {
  const token = newToken();
  const expires_at = nowIso(new Date(Date.now() + INVITATION_TTL));
  const id = db.transaction((tx) =>
    repo.insertInvitation(tx, {
      token_hash: hashToken(token),
      bar_id: barId,
      created_by: userId,
      role,
      expires_at,
    }),
  );
  return { id, token, role, expires_at };
}

function requireInvitation(db: Executor, token: string) {
  const invitation = repo.findInvitation(db, hashToken(token));
  if (!invitation) throw notFound("Invitation");
  return invitation;
}

export function previewInvitation(db: Db, token: string): z.output<typeof invitationPreviewSchema> {
  const { bar_name, role, expires_at } = requireInvitation(db, token);
  return { bar_name, role, expires_at, can_register: canRegister(db, "invitation") };
}

function join(
  tx: Tx,
  invitation: ReturnType<typeof requireInvitation>,
  userId: string,
): BarSummary {
  if (!repo.insertInvitedMember(tx, invitation, userId)) {
    throw conflict("You are already a member of this bar");
  }
  repo.deleteInvitation(tx, invitation.bar_id, invitation.id);
  return { id: invitation.bar_id, name: invitation.bar_name, role: invitation.role };
}

export function acceptInvitation(db: Db, token: string, userId: string): BarSummary {
  return db.transaction((tx) => join(tx, requireInvitation(tx, token), userId), {
    behavior: "immediate",
  });
}

export async function registerByInvitation(
  db: Db,
  { token, email, display_name, password }: RegisterByInvitation,
  previous: string,
) {
  requireRegistration(db, "invitation");
  requireInvitation(db, token);
  const passwordHash = await hashPassword(password);
  return db.transaction(
    (tx) => {
      const invitation = requireInvitation(tx, token);
      requireRegistration(tx, "invitation");
      const user = createAccount(tx, { email, display_name }, passwordHash);
      const bar = join(tx, invitation, user.id);
      return { bar, session: startSession(tx, user.id, previous) };
    },
    { behavior: "immediate" },
  );
}

export const pendingInvitations = ({ db, barId }: Ctx) => ({
  invitations: repo.listPendingInvitations(db, barId),
});

export function revokeInvitation({ db, barId }: Ctx, id: string) {
  repo.deleteInvitation(db, barId, parseId(id, "Invitation"));
}
