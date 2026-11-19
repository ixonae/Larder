import {
  buildTree,
  type Category,
  type CategoryTreeNode,
  type CreateCategory,
  type ListCategoriesQuery,
  type Page,
  subtreeIds,
  type UpdateCategory,
  type UsedBy,
} from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { decodeCursor, toPage } from "../../db/cursor.ts";
import { onUniqueViolation } from "../../db/errors.ts";
import { conflict, invalid, notFound, parseId } from "../../errors.ts";
import type { Ctx } from "../../types.ts";
import { deleteWithImage } from "../images/service.ts";
import { listProductsInCategory } from "../products/repo.ts";
import * as repo from "./repo.ts";

/** `GET /categories`: a page of the flat list, sorted by name. */
export function listCategories(ctx: Ctx, query: ListCategoriesQuery): Page<Category> {
  const rows = repo.listCategories(ctx.db, ctx.barId, {
    q: query.q,
    kind: query.kind,
    parent_id: query.parent_id,
    after: query.cursor === undefined ? undefined : decodeCursor(query.cursor),
    limit: query.limit + 1,
  });
  return toPage(rows, query.limit);
}

/** `GET /categories/tree`: every category, nested, siblings sorted by name. */
export function getCategoryTree(ctx: Ctx): CategoryTreeNode[] {
  return buildTree(repo.listAllCategories(ctx.db, ctx.barId));
}

function requireCategory(db: Executor, barId: string, id: string | undefined): Category {
  const category = repo.findCategory(db, barId, parseId(id, "Category"));
  if (!category) throw notFound("Category");
  return category;
}

function requireParent(db: Executor, barId: string, parentId: string): Category {
  const parent = repo.findCategory(db, barId, parentId);
  if (!parent) throw invalid("Parent category not found", { parent_id: parentId });
  return parent;
}

/** The duplicate is reported on the `name` field, so forms can show it there. */
const duplicateName = (name: string) => () => {
  const message = `A category named "${name}" already exists at this level`;
  return conflict(message, [{ path: ["name"], message }]);
};

export function getCategory(ctx: Ctx, id: string | undefined): Category {
  return requireCategory(ctx.db, ctx.barId, id);
}

export function createCategory(ctx: Ctx, input: CreateCategory): Category {
  return ctx.db.transaction((tx) => {
    const parentId = input.parent_id ?? null;
    const parent = parentId === null ? undefined : requireParent(tx, ctx.barId, parentId);
    const kind = input.kind ?? parent?.kind;
    if (!kind) throw invalid("kind is required for a root category");
    const { name } = input;
    return onUniqueViolation(
      () =>
        repo.insertCategory(tx, {
          bar_id: ctx.barId,
          created_by: ctx.userId,
          name,
          parent_id: parentId,
          kind,
          default_abv: input.default_abv ?? null,
          description: input.description ?? null,
        }),
      duplicateName(name),
    );
  });
}

export function updateCategory(ctx: Ctx, id: string | undefined, patch: UpdateCategory): Category {
  return ctx.db.transaction((tx) => {
    const existing = requireCategory(tx, ctx.barId, id);
    // Only a real move needs the parent and cycle checks (forms send the unchanged parent too).
    if (patch.parent_id && patch.parent_id !== existing.parent_id) {
      requireParent(tx, ctx.barId, patch.parent_id);
      if (subtreeIds(repo.listAllCategories(tx, ctx.barId), existing.id).has(patch.parent_id)) {
        throw invalid("A category cannot be moved under itself or one of its sub-categories");
      }
    }
    const name = patch.name ?? existing.name;
    return onUniqueViolation(
      () => repo.updateCategory(tx, ctx.barId, existing.id, patch),
      duplicateName(name),
    );
  });
}

/**
 * Deletes the category and its picture. Refused with `CONFLICT` while sub-categories or bottles use it
 * (cocktail lines in S17).
 */
export async function deleteCategory(ctx: Ctx, id: string | undefined): Promise<void> {
  await deleteWithImage(ctx, (tx) => {
    const existing = requireCategory(tx, ctx.barId, id);
    const children = repo.listChildren(tx, ctx.barId, existing.id);
    const bottles = listProductsInCategory(tx, ctx.barId, existing.id);
    if (children.length > 0 || bottles.length > 0) {
      const details: UsedBy = {
        used_by: [
          ...children.map((c) => ({ type: "category" as const, id: c.id, name: c.name })),
          ...bottles.map((p) => ({ type: "product" as const, id: p.id, name: p.name })),
        ],
      };
      const what = [children.length > 0 && "sub-categories", bottles.length > 0 && "bottles"];
      throw conflict(`"${existing.name}" still has ${what.filter(Boolean).join(" and ")}`, details);
    }
    repo.deleteCategory(tx, ctx.barId, existing.id);
    return existing.image_id;
  });
}
