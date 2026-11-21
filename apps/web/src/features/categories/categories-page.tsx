import {
  type BarSummary,
  CATEGORY_KIND_LABEL,
  type Category,
  type CategoryTreeNode,
  hasRole,
} from "@larder/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { type JSX, type ReactNode, useState } from "react";
import { categoryTreeQuery, useCategoryMutations } from "@/api/categories.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { Thumbnail } from "@/components/thumbnail.tsx";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";
import { CategorySheet, type SheetTarget } from "./category-sheet.tsx";

const Title = (): JSX.Element => <h1 className="text-3xl">Categories</h1>;

export function CategoriesPage(): JSX.Element {
  return (
    <BarGate title="Categories">
      {(bar: BarSummary): JSX.Element => (
        <section className="mx-auto flex max-w-5xl flex-col gap-4">
          <CategoriesView barId={bar.id} canEdit={hasRole(bar.role, "editor")} />
        </section>
      )}
    </BarGate>
  );
}

interface RowActions {
  /** Viewers only read: the add, edit and delete buttons are hidden. */
  canEdit: boolean;
  expanded: ReadonlySet<string>;
  toggle: (id: string) => void;
  add: (parent: Category) => void;
  edit: (category: Category) => void;
  remove: (category: Category) => void;
}

function CategoriesView({
  barId,
  canEdit,
}: Readonly<{ barId: string; canEdit: boolean }>): JSX.Element {
  const tree = useQuery(categoryTreeQuery(barId));
  const { remove } = useCategoryMutations(barId);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [target, setTarget] = useState<SheetTarget | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const actions: RowActions = {
    canEdit,
    expanded,
    toggle: (id: string) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    add: (parent: Category) => {
      setExpanded((prev) => new Set(prev).add(parent.id));
      setTarget({ editing: null, parentId: parent.id });
    },
    edit: (category: Category) => setTarget({ editing: category, parentId: null }),
    remove: setDeleting,
  };

  let content: ReactNode;
  if (tree.isPending) {
    content = <LoadingState label="Loading categories…" />;
  } else if (tree.isError) {
    content = (
      <ErrorState
        error={tree.error}
        onRetry={(): ReturnType<typeof tree.refetch> => tree.refetch()}
      />
    );
  } else if (tree.data.length === 0) {
    content = (
      <EmptyState title="No categories yet">Add one to start organising your bar.</EmptyState>
    );
  } else {
    content = (
      <nav aria-label="Category tree">
        <TreeList nodes={tree.data} depth={0} actions={actions} />
      </nav>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Title />
        {canEdit && (
          <Button onClick={(): void => setTarget({ editing: null, parentId: null })}>
            <Plus aria-hidden />
            Add category
          </Button>
        )}
      </div>

      {content}

      <CategorySheet
        barId={barId}
        tree={tree.data ?? []}
        target={target}
        onClose={(): void => setTarget(null)}
      />
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
    </>
  );
}

function TreeList({
  nodes,
  depth,
  actions,
}: Readonly<{
  nodes: CategoryTreeNode[];
  depth: number;
  actions: RowActions;
}>): JSX.Element {
  return (
    <ul
      className={
        depth === 0 ? "flex flex-col rounded-xl border bg-card p-1.5 shadow-xs" : "flex flex-col"
      }
    >
      {nodes.map((node) => (
        <TreeRow key={node.id} node={node} depth={depth} actions={actions} />
      ))}
    </ul>
  );
}

function TreeRow({
  node,
  depth,
  actions,
}: Readonly<{
  node: CategoryTreeNode;
  depth: number;
  actions: RowActions;
}>): JSX.Element {
  const { children, ...category } = node;
  const open = actions.expanded.has(node.id);
  return (
    <li>
      <div
        className="flex items-center gap-1 rounded-md hover:bg-accent/50"
        style={{ paddingLeft: `${depth * 1.25}rem` }}
      >
        {children.length > 0 ? (
          <Button
            variant="ghost"
            size="icon"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
            onClick={(): void => actions.toggle(node.id)}
          >
            {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
          </Button>
        ) : (
          <span className="size-9 shrink-0" />
        )}
        <Thumbnail imageId={node.image_id} className="size-7" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <span className="hidden text-muted-foreground text-xs sm:inline">
          {CATEGORY_KIND_LABEL[node.kind]}
          {node.default_abv !== null && ` · ${node.default_abv}%`}
        </span>
        {actions.canEdit && (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Add under ${node.name}`}
              onClick={(): void => actions.add(category)}
            >
              <Plus aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Edit ${node.name}`}
              onClick={(): void => actions.edit(category)}
            >
              <Pencil aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${node.name}`}
              onClick={(): void => actions.remove(category)}
            >
              <Trash2 aria-hidden />
            </Button>
          </>
        )}
      </div>
      {open && children.length > 0 && (
        <TreeList nodes={children} depth={depth + 1} actions={actions} />
      )}
    </li>
  );
}
