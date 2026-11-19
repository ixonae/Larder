import { type Category, type CategoryTreeNode, idSchema } from "@larder/shared";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { z } from "zod";
import { categoryTreeQuery } from "@/api/categories.ts";
import { ErrorState, LoadingState } from "@/components/states.tsx";

/** `<option>`s for a category picker, indented by depth as `flattenTree` returns them. */
export function CategoryOptions({ items }: { items: { item: Category; depth: number }[] }) {
  return items.map(({ item, depth }) => (
    <option key={item.id} value={item.id}>
      {"  ".repeat(depth)}
      {item.name}
    </option>
  ));
}

/** A form's `category_id`: the picker's empty "Choose…" option is refused with a message. */
export const categoryIdField = idSchema
  .or(z.literal(""))
  .refine((v) => v !== "", "Choose a category");

/** Waits for the category tree, so a form's picker opens with the saved category selected. */
export function CategoryTreeLoader({
  barId,
  children,
}: {
  barId: string;
  children: (tree: CategoryTreeNode[]) => ReactNode;
}) {
  const tree = useQuery(categoryTreeQuery(barId));
  if (tree.isPending) return <LoadingState label="Loading categories…" />;
  if (tree.isError) return <ErrorState error={tree.error} onRetry={() => tree.refetch()} />;
  return children(tree.data);
}
