import { nowIso } from "@larder/shared";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { AppError, conflict } from "../../errors.ts";
import type { ImageStorage } from "../../storage/storage.ts";
import type { Db, Tx } from "../client.ts";
import { barDataMigrations, bars, starterImports, users } from "../schema/index.ts";

const MAX_OWNER_STARTER_BARS = 3;
export const MAX_STARTER_BARS = 24;
const MAX_ACTIVE_IMPORTS = 2;
const IMPORT_TIMEOUT_MS = 15 * 60_000;

function requireEnabledOwner(tx: Tx, ownerId: string): void {
  const enabled = tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, ownerId), eq(users.disabled, false)))
    .get();
  if (!enabled) throw new AppError("UNAUTHORIZED", "Sign in to continue");
}

/** Check the committed bars and reserve the new bar's slot under the same SQLite write lock. */
export function reserveStarterImport(
  db: Db,
  barId: string,
  ownerId: string,
  optedOut: string,
): string {
  const expires = nowIso(new Date(Date.now() + IMPORT_TIMEOUT_MS));
  db.transaction(
    (tx) => {
      requireEnabledOwner(tx, ownerId);
      // An older bar without any migration markers is also due to receive the starter catalogue.
      const usage = tx.get<{ total: number; owned: number; active: number }>(sql`
      WITH seeded(owner_id, pending) AS (
        SELECT ${bars.owner_id}, 0 FROM ${bars}
        WHERE NOT EXISTS (
          SELECT 1 FROM ${barDataMigrations}
          WHERE ${barDataMigrations.bar_id} = ${bars.id} AND ${barDataMigrations.migration} = ${optedOut}
        )
        UNION ALL SELECT ${starterImports.owner_id}, 1 FROM ${starterImports}
      )
      SELECT count(*) AS total, count(*) FILTER (WHERE owner_id = ${ownerId}) AS owned,
             count(*) FILTER (WHERE pending = 1) AS active FROM seeded
    `);
      if (usage.owned >= MAX_OWNER_STARTER_BARS)
        throw conflict(
          `An account can own up to ${MAX_OWNER_STARTER_BARS} bars with starter data.`,
        );
      if (usage.total >= MAX_STARTER_BARS)
        throw conflict(
          `This installation has reached its limit of ${MAX_STARTER_BARS} bars with starter data.`,
        );
      if (usage.active >= MAX_ACTIVE_IMPORTS)
        throw new AppError(
          "UNAVAILABLE",
          "Other starter catalogues are being imported. Try again shortly.",
          undefined,
          { "Retry-After": "5" },
        );
      tx.insert(starterImports)
        .values({ bar_id: barId, owner_id: ownerId, expires_at: expires })
        .run();
    },
    { behavior: "immediate" },
  );
  return expires;
}

export function checkImportDeadline(expires: string): void {
  if (expires <= nowIso())
    throw new AppError("UNAVAILABLE", "Starter catalogue import timed out. Try again.");
}

/** Called inside the bar-creation transaction. A timed-out import cannot publish a partially cleaned bar. */
export function finishStarterImport(tx: Tx, barId: string, ownerId: string): void {
  requireEnabledOwner(tx, ownerId);
  const consumed = tx
    .delete(starterImports)
    .where(
      and(
        eq(starterImports.bar_id, barId),
        eq(starterImports.owner_id, ownerId),
        gt(starterImports.expires_at, nowIso()),
      ),
    )
    .run();
  if (!consumed.changes)
    throw new AppError("UNAVAILABLE", "Starter catalogue import expired. Try again.");
}

export async function discardStarterImport(
  db: Db,
  storage: ImageStorage,
  barId: string,
): Promise<void> {
  // Keep the reservation until filesystem cleanup succeeds, so a restart can retry it.
  await storage.discardStagedBar(barId);
  db.delete(starterImports).where(eq(starterImports.bar_id, barId)).run();
}

/** Only reclaim expired slots. Another API process using this database may still be staging files. */
export async function recoverStarterImports(db: Db, storage: ImageStorage): Promise<void> {
  // Withdraw the reservation before touching files. A worker with a slower clock cannot commit it.
  const expired = db
    .update(starterImports)
    .set({ owner_id: null })
    .where(lte(starterImports.expires_at, nowIso()))
    .returning({ id: starterImports.bar_id })
    .all();
  for (const { id } of expired) await discardStarterImport(db, storage, id); // NOSONAR
}
