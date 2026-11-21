import {
  type BarSummary,
  type CurrencyCode,
  formatMoney,
  type Product,
  type Purchase,
} from "@larder/shared";
import { useQuery } from "@tanstack/react-query";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { type JSX, type ReactNode, useState } from "react";
import { purchasesQuery, usePurchaseMutations } from "@/api/products.ts";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { ErrorState, LoadingState } from "@/components/states.tsx";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";
import { formatDate } from "@/lib/dates.ts";
import { PurchaseSheet, type PurchaseTarget } from "./purchase-sheet.tsx";

/** "¥9,000 + $25.00": what the bottle cost, summed per currency. */
function totalSpent(purchases: Purchase[]): string | null {
  const totals = new Map<CurrencyCode, number>();
  for (const { price_minor, currency } of purchases) {
    if (price_minor !== null && currency !== null) {
      totals.set(currency, (totals.get(currency) ?? 0) + price_minor);
    }
  }
  if (totals.size === 0) return null;
  return [...totals].map(([currency, minor]) => formatMoney(minor, currency)).join(" + ");
}

/** Open bottles, last dates and total spent, then every purchase newest first. */
export function PurchaseHistory({
  bar,
  product,
  canEdit,
}: Readonly<{ bar: BarSummary; product: Product; canEdit: boolean }>): JSX.Element {
  const purchases = useQuery(purchasesQuery(bar.id, product.id));
  const { update: updatePurchase, remove: removePurchase } = usePurchaseMutations(bar.id);
  const [editing, setEditing] = useState<PurchaseTarget>(null);
  const [deleting, setDeleting] = useState<Purchase | null>(null);
  const { stock } = product;
  const items = purchases.data?.items ?? [];

  const facts: [string, string | number | null][] = [
    ["Open bottles", stock.open_count],
    ["Last bought", stock.last_bought_on && formatDate(stock.last_bought_on)],
    ["Last ran out", stock.last_finished_on && formatDate(stock.last_finished_on)],
    ["Total spent", totalSpent(items)],
  ];

  const reopen = (purchase: Purchase): void =>
    updatePurchase.mutate(
      { id: product.id, purchaseId: purchase.id, json: { finished_on: null } },
      {
        onSuccess: () => toast("Bottle reopened"),
        onError: (err: Error) =>
          toast("Could not reopen the bottle", { description: err.message, variant: "error" }),
      },
    );

  let history: ReactNode;
  if (purchases.isPending) history = <LoadingState label="Loading purchases…" />;
  else if (purchases.isError) {
    history = (
      <ErrorState
        error={purchases.error}
        onRetry={(): ReturnType<typeof purchases.refetch> => purchases.refetch()}
      />
    );
  } else if (items.length === 0) {
    history = <p className="text-muted-foreground text-sm">No purchases recorded yet.</p>;
  } else {
    history = (
      <ul
        aria-label="Purchases"
        className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-xs"
      >
        {items.map((purchase) => (
          <li key={purchase.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {formatDate(purchase.bought_on)}
                {purchase.price_minor !== null && purchase.currency !== null && (
                  <span> · {formatMoney(purchase.price_minor, purchase.currency)}</span>
                )}
              </p>
              <p className="text-muted-foreground text-sm">
                {[
                  purchase.store,
                  purchase.finished_on ? `Ran out ${formatDate(purchase.finished_on)}` : "Open",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {purchase.notes && <p className="text-sm">{purchase.notes}</p>}
            </div>
            {canEdit && (
              <div className="flex gap-1">
                {purchase.finished_on && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={updatePurchase.isPending}
                    onClick={(): void => reopen(purchase)}
                  >
                    <RotateCcw aria-hidden />
                    Reopen
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit purchase of ${formatDate(purchase.bought_on)}`}
                  onClick={(): void =>
                    setEditing({
                      kind: "edit",
                      productId: product.id,
                      productName: product.name,
                      purchase,
                    })
                  }
                >
                  <Pencil aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete purchase of ${formatDate(purchase.bought_on)}`}
                  onClick={(): void => setDeleting(purchase)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-label="Stock" className="flex flex-col gap-3">
      <dl
        aria-label="Stock summary"
        className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border bg-card p-4 text-sm shadow-xs sm:grid-cols-[auto_1fr_auto_1fr] sm:p-5"
      >
        {facts
          .filter(([, value]) => value !== null)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      <h3 className="font-medium">Purchase history</h3>
      {history}
      <PurchaseSheet
        barId={bar.id}
        currency={bar.currency}
        target={editing}
        onClose={(): void => setEditing(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(): void => setDeleting(null)}
        title="Delete this purchase?"
        description="This cannot be undone."
        onConfirm={async (): Promise<void> => {
          // The dialog is only open while a purchase is chosen.
          const purchaseId = (deleting as Purchase).id;
          await removePurchase.mutateAsync({ id: product.id, purchaseId });
          toast("Purchase deleted");
        }}
      />
    </section>
  );
}
