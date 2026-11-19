import {
  type BarSummary,
  hasRole,
  UTENSIL_KIND_PLURAL,
  UTENSIL_KINDS,
  type Utensil,
} from "@larder/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useUtensilMutations, utensilListQuery } from "@/api/utensils.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";
import { UtensilSheet, type UtensilTarget } from "./utensil-sheet.tsx";

export function UtensilsPage() {
  return <BarGate title="Utensils">{(bar) => <UtensilsView key={bar.id} bar={bar} />}</BarGate>;
}

function UtensilsView({ bar }: { bar: BarSummary }) {
  const canEdit = hasRole(bar.role, "editor");
  const list = useInfiniteQuery(utensilListQuery(bar.id));
  const { remove } = useUtensilMutations(bar.id);
  const [target, setTarget] = useState<UtensilTarget>(null);
  const [deleting, setDeleting] = useState<Utensil | null>(null);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-semibold text-2xl">Utensils</h1>
        {canEdit && (
          <Button onClick={() => setTarget("new")}>
            <Plus aria-hidden />
            Add utensil
          </Button>
        )}
      </div>

      {list.isPending ? (
        <LoadingState label="Loading utensils…" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No utensils yet">Add your glasses and bar tools.</EmptyState>
      ) : (
        <>
          {UTENSIL_KINDS.map((kind) => {
            const group = items.filter((u) => u.kind === kind);
            if (group.length === 0) return null;
            const heading = `utensils-${kind}`;
            return (
              <div key={kind} className="flex flex-col gap-2">
                <h2 id={heading} className="font-medium text-muted-foreground text-sm">
                  {UTENSIL_KIND_PLURAL[kind]}
                </h2>
                <ul aria-labelledby={heading} className="flex flex-col divide-y rounded-lg border">
                  {group.map((utensil) => (
                    <li key={utensil.id} className="flex items-center gap-2 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{utensil.name}</p>
                        {(utensil.capacity_ml !== null || utensil.description) && (
                          <p className="truncate text-muted-foreground text-sm">
                            {[
                              utensil.capacity_ml !== null && `${utensil.capacity_ml} ml`,
                              utensil.description,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                      {canEdit && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${utensil.name}`}
                            onClick={() => setTarget(utensil)}
                          >
                            <Pencil aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${utensil.name}`}
                            onClick={() => setDeleting(utensil)}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {list.hasNextPage && (
            <Button
              variant="outline"
              disabled={list.isFetchingNextPage}
              onClick={() => list.fetchNextPage()}
            >
              Load more
            </Button>
          )}
        </>
      )}

      <UtensilSheet barId={bar.id} target={target} onClose={() => setTarget(null)} />
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Delete ${deleting.name}?`}
          description="This cannot be undone."
          onConfirm={async () => {
            await remove.mutateAsync(deleting.id);
            toast(`Deleted ${deleting.name}`);
          }}
        />
      )}
    </section>
  );
}
