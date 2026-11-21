import {
  ancestry,
  type Category,
  type CategoryTreeNode,
  flattenTree,
  idSchema,
  isBottleCategory,
} from "@larder/shared";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { z } from "zod";
import { categoryTreeQuery } from "@/api/categories.ts";
import type { ComboboxOption } from "@/components/combobox.tsx";
import { ErrorState, LoadingState } from "@/components/states.tsx";

export type CategoryOption = ComboboxOption & { item: Category };

/**
 * Combobox options for a category picker: the tree in display order, indented for browsing, each
 * with its ancestors as context for search. `keep` filters rows; context always uses the full tree.
 */
export function categoryOptions(
  tree: readonly CategoryTreeNode[],
  keep: (item: Category, byId: ReadonlyMap<string, Category>) => boolean,
): CategoryOption[] {
  const entries = flattenTree(tree);
  const byId = new Map(entries.map(({ item }) => [item.id, item]));
  return entries
    .filter(({ item }) => keep(item, byId))
    .map(({ item, depth }) => {
      const parents = ancestry(byId, item.id).slice(1).reverse();
      return {
        item,
        value: item.id,
        label: item.name,
        depth,
        context: parents.map(({ name }) => name).join(" › ") || undefined,
      };
    });
}

export const bottleCategoryOptions = (
  tree: readonly CategoryTreeNode[],
  currentId?: string,
): CategoryOption[] =>
  categoryOptions(tree, (item, byId) => item.id === currentId || isBottleCategory(item, byId));

/** A form's `category_id`: the picker's empty "Choose…" option is refused with a message. */
export const categoryIdField = idSchema
  .or(z.literal(""))
  .refine((v) => v !== "", "Choose a category");

/** Waits for the category tree, so a form's picker opens with the saved category selected. */
export function CategoryTreeLoader({
  barId,
  children,
}: Readonly<{
  barId: string;
  children: (tree: CategoryTreeNode[]) => ReactNode;
}>): ReactNode {
  const tree = useQuery(categoryTreeQuery(barId));
  if (tree.isPending) return <LoadingState label="Loading categories…" />;
  if (tree.isError)
    return (
      <ErrorState
        error={tree.error}
        onRetry={(): ReturnType<typeof tree.refetch> => tree.refetch()}
      />
    );
  return children(tree.data);
}
