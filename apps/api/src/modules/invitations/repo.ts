import { nowIso, type PendingInvitation } from "@larder/shared";
import { and, desc, eq, gt, lte } from "drizzle-orm";
import type { Db, Executor, Tx } from "../../db/client.ts";
import { barInvitations, barMembers, bars } from "../../db/schema/index.ts";

export type InvitationRow = Pick<
  typeof barInvitations.$inferInsert,
  "bar_id" | "token_hash" | "role" | "created_by" | "expires_at"
>;

export function insertInvitation(tx: Tx, invite: InvitationRow): string {
  tx.delete(barInvitations)
    .where(and(eq(barInvitations.bar_id, invite.bar_id), lte(barInvitations.expires_at, nowIso())))
    .run();
  return tx.insert(barInvitations).values(invite).returning({ id: barInvitations.id }).get().id;
}

export type FoundInvitation = PendingInvitation & {
  bar_id: string;
  bar_name: string;
};

export function findInvitation(db: Executor, digest: string): FoundInvitation | undefined {
  return db
    .select({
      id: barInvitations.id,
      bar_id: barInvitations.bar_id,
      bar_name: bars.name,
      role: barInvitations.role,
      expires_at: barInvitations.expires_at,
    })
    .from(barInvitations)
    .innerJoin(bars, eq(bars.id, barInvitations.bar_id))
    .where(and(eq(barInvitations.token_hash, digest), gt(barInvitations.expires_at, nowIso())))
    .get();
}

export function insertInvitedMember(tx: Tx, invitation: FoundInvitation, userId: string): boolean {
  const result = tx
    .insert(barMembers)
    .values({ bar_id: invitation.bar_id, user_id: userId, role: invitation.role })
    .onConflictDoNothing({ target: [barMembers.bar_id, barMembers.user_id] })
    .run();
  return result.changes === 1;
}

export function deleteInvitation(db: Executor, barId: string, id: string): void {
  db.delete(barInvitations)
    .where(and(eq(barInvitations.bar_id, barId), eq(barInvitations.id, id)))
    .run();
}

export function listPendingInvitations(db: Db, barId: string): PendingInvitation[] {
  return db
    .select({
      id: barInvitations.id,
      role: barInvitations.role,
      expires_at: barInvitations.expires_at,
    })
    .from(barInvitations)
    .where(and(eq(barInvitations.bar_id, barId), gt(barInvitations.expires_at, nowIso())))
    .orderBy(desc(barInvitations.expires_at), desc(barInvitations.id))
    .all();
}
