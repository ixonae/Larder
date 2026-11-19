import type {
  CreateUtensil,
  ListUtensilsQuery,
  Page,
  UpdateUtensil,
  Utensil,
  UtensilKind,
} from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { decodeCursor, toPage } from "../../db/cursor.ts";
import { onUniqueViolation } from "../../db/errors.ts";
import { conflict, invalid, notFound, parseId } from "../../errors.ts";
import type { Ctx } from "../../types.ts";
import * as repo from "./repo.ts";

/** `GET /utensils`: a page sorted by name. */
export function listUtensils(ctx: Ctx, query: ListUtensilsQuery): Page<Utensil> {
  const rows = repo.listUtensils(ctx.db, ctx.barId, {
    q: query.q,
    kind: query.kind,
    after: query.cursor === undefined ? undefined : decodeCursor(query.cursor),
    limit: query.limit + 1,
  });
  return toPage(rows, query.limit);
}

function requireUtensil(db: Executor, barId: string, id: string | undefined): Utensil {
  const utensil = repo.findUtensil(db, barId, parseId(id, "Utensil"));
  if (!utensil) throw notFound("Utensil");
  return utensil;
}

/**
 * Only glasses have a capacity. Sending one for a tool is refused; turning a glass into a tool drops
 * the capacity it had.
 */
function resolveCapacity(
  kind: UtensilKind,
  requested: number | null | undefined,
  current: number | null,
): number | null {
  if (kind === "glass") return requested === undefined ? current : requested;
  if (requested !== undefined && requested !== null) {
    throw invalid("Only glasses have a capacity", [
      { path: ["capacity_ml"], message: "Only glasses have a capacity" },
    ]);
  }
  return null;
}

/** The duplicate is reported on the `name` field, so forms can show it there. */
const duplicateName = (name: string) => () => {
  const message = `A utensil named "${name}" already exists`;
  return conflict(message, [{ path: ["name"], message }]);
};

export function getUtensil(ctx: Ctx, id: string | undefined): Utensil {
  return requireUtensil(ctx.db, ctx.barId, id);
}

export function createUtensil(ctx: Ctx, input: CreateUtensil): Utensil {
  return ctx.db.transaction((tx) => {
    const id = onUniqueViolation(
      () =>
        repo.insertUtensil(tx, {
          bar_id: ctx.barId,
          created_by: ctx.userId,
          name: input.name,
          kind: input.kind,
          capacity_ml: resolveCapacity(input.kind, input.capacity_ml, null),
          description: input.description ?? null,
        }),
      duplicateName(input.name),
    );
    return requireUtensil(tx, ctx.barId, id);
  });
}

export function updateUtensil(ctx: Ctx, id: string | undefined, patch: UpdateUtensil): Utensil {
  return ctx.db.transaction((tx) => {
    const existing = requireUtensil(tx, ctx.barId, id);
    const kind = patch.kind ?? existing.kind;
    const name = patch.name ?? existing.name;
    onUniqueViolation(
      () =>
        repo.updateUtensil(tx, ctx.barId, existing.id, {
          ...patch,
          capacity_ml: resolveCapacity(kind, patch.capacity_ml, existing.capacity_ml),
        }),
      duplicateName(name),
    );
    return requireUtensil(tx, ctx.barId, existing.id);
  });
}

/** Nothing references utensils yet; the cocktail glass (S16) and tool (S17) checks come later. */
export function deleteUtensil(ctx: Ctx, id: string | undefined): void {
  ctx.db.transaction((tx) => {
    const existing = requireUtensil(tx, ctx.barId, id);
    repo.deleteUtensil(tx, ctx.barId, existing.id);
  });
}
