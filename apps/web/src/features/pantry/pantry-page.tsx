import {
  ancestors,
  type BarSummary,
  type CategoryTreeNode,
  flattenTree,
  hasRole,
  type PantryIngredient,
} from "@larder/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Apple, Pencil, Plus, Trash2 } from "lucide-react";
import { type JSX, type ReactNode, useMemo, useState } from "react";
import { categoryTreeQuery } from "@/api/categories.ts";
import { pantryListQuery, usePantryMutations } from "@/api/pantry.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { Thumbnail } from "@/components/thumbnail.tsx";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";
import { IngredientSheet, type IngredientTarget } from "./ingredient-sheet.tsx";
import { StockToggle } from "./stock-toggle.tsx";

export function PantryPage(): JSX.Element {
  return (
    <BarGate title="Pantry">
      {(bar: BarSummary): JSX.Element => <PantryView key={bar.id} bar={bar} />}
    </BarGate>
  );
}

/** Each category's path ("Garnish › Citrus"), so same-named sub-categories stay apart. */
function categoryPaths(tree: CategoryTreeNode[]): Map<string, string> {
  const items = flattenTree(tree).map(({ item }) => item);
  return new Map(
    items.map((c) => [
      c.id,
      [...ancestors(items, c.id).reverse(), c].map((a) => a.name).join(" › "),
    ]),
  );
}

/**
 * Ingredients grouped by category, headed by its path (just the name until the tree loads), groups
 * sorted by heading; items keep the API's name order.
 */
function byCategory(
  items: PantryIngredient[],
  paths: Map<string, string>,
): [string, { name: string; items: PantryIngredient[] }][] {
  const groups = new Map<string, { name: string; items: PantryIngredient[] }>();
  for (const item of items) {
    const name = paths.get(item.category_id) ?? item.category_name;
    const group = groups.get(item.category_id) ?? { name, items: [] };
    group.items.push(item);
    groups.set(item.category_id, group);
  }
  return [...groups.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name));
}

function PantryView({ bar }: Readonly<{ bar: BarSummary }>): JSX.Element {
  const canEdit = hasRole(bar.role, "editor");
  const list = useInfiniteQuery(pantryListQuery(bar.id));
  const { remove } = usePantryMutations(bar.id);
  const [target, setTarget] = useState<IngredientTarget>(null);
  const [deleting, setDeleting] = useState<PantryIngredient | null>(null);
  const tree = useQuery(categoryTreeQuery(bar.id));
  const paths = useMemo(() => categoryPaths(tree.data ?? []), [tree.data]);
  const groups = useMemo(
    () => byCategory(list.data?.pages.flatMap((page) => page.items) ?? [], paths),
    [list.data, paths],
  );

  let content: ReactNode;
  if (list.isPending) {
    content = <LoadingState label="Loading the pantry…" />;
  } else if (list.isError) {
    content = (
      <ErrorState
        error={list.error}
        onRetry={(): ReturnType<typeof list.refetch> => list.refetch()}
      />
    );
  } else if (groups.length === 0) {
    content = (
      <EmptyState title="The pantry is empty">
        Add the fruit, eggs and other supplies you keep next to your bottles.
      </EmptyState>
    );
  } else {
    content = (
      <>
        {groups.map(([categoryId, group]) => {
          const heading = `pantry-${categoryId}`;
          return (
            <div key={categoryId} className="flex flex-col gap-2">
              <h2 id={heading} className="font-medium text-muted-foreground text-sm">
                {group.name}
              </h2>
              <ul
                aria-labelledby={heading}
                className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-xs"
              >
                {group.items.map((ingredient) => (
                  <IngredientRow
                    key={ingredient.id}
                    barId={bar.id}
                    ingredient={ingredient}
                    canEdit={canEdit}
                    onEdit={(): void => setTarget(ingredient)}
                    onDelete={(): void => setDeleting(ingredient)}
                  />
                ))}
              </ul>
            </div>
          );
        })}
        {list.hasNextPage && (
          <Button
            variant="outline"
            disabled={list.isFetchingNextPage}
            onClick={(): ReturnType<typeof list.fetchNextPage> => list.fetchNextPage()}
          >
            Load more
          </Button>
        )}
      </>
    );
  }

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-3xl">Pantry</h1>
        {canEdit && (
          <Button onClick={(): void => setTarget("new")}>
            <Plus aria-hidden />
            Add ingredient
          </Button>
        )}
      </div>

      {content}

      <IngredientSheet barId={bar.id} target={target} onClose={(): void => setTarget(null)} />
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(): void => setDeleting(null)}
          title={`Delete ${deleting.name}?`}
          description="This cannot be undone."
          onConfirm={async (): Promise<void> => {
            await remove.mutateAsync(deleting.id);
            toast(`Deleted ${deleting.name}`);
          }}
        />
      )}
    </section>
  );
}

function IngredientRow({
  barId,
  ingredient,
  canEdit,
  onEdit,
  onDelete,
}: Readonly<{
  barId: string;
  ingredient: PantryIngredient;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}>): JSX.Element {
  return (
    <li className="flex items-center gap-2 p-3">
      <Thumbnail imageId={ingredient.image_id} icon={Apple} />
      <p className="min-w-0 flex-1 truncate font-medium">{ingredient.name}</p>
      <StockToggle barId={barId} ingredient={ingredient} canEdit={canEdit} />
      {canEdit && (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${ingredient.name}`}
            onClick={onEdit}
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${ingredient.name}`}
            onClick={onDelete}
          >
            <Trash2 aria-hidden />
          </Button>
        </>
      )}
    </li>
  );
}
