import {
  type CurrencyCode,
  PRODUCT_STATUSES,
  type Product,
  type ProductStatus,
} from "@larder/shared";
import { cn } from "cn";
import { Check, ChevronDown, PackageMinus, PackagePlus } from "lucide-react";
import { type ChangeEvent, type JSX, type SubmitEvent, useId, useState } from "react";
import { useFinishBottle, useSetBottleStatus } from "@/api/products.ts";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import { localToday } from "@/lib/dates.ts";
import { StatusBadge, statusLabel } from "./bottle-status.tsx";
import { PurchaseSheet, type PurchaseTarget } from "./purchase-sheet.tsx";

const menuItem =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-50";

/**
 * Where the bottle stands, and what can change it: a dropdown whose trigger shows the status, with
 * the stock actions ("Bought a bottle…", "Ran out…") first and every status to set by hand below.
 * Viewers only see the status badge.
 */
export function StockAction({
  barId,
  currency,
  product,
  canEdit,
}: Readonly<{
  barId: string;
  currency: CurrencyCode;
  product: Product;
  canEdit: boolean;
}>): JSX.Element {
  const [open, setOpen] = useState(false);
  const [buying, setBuying] = useState<PurchaseTarget>(null);
  const [finishing, setFinishing] = useState(false);
  const setStatus = useSetBottleStatus(barId);
  if (!canEdit) return <StatusBadge status={product.status} />;
  const owned = product.status === "owned";
  const current = statusLabel(product.status);
  const choose = (status: ProductStatus | null): void => {
    setOpen(false);
    if (status === product.status) return;
    setStatus.mutate(
      { id: product.id, status },
      {
        onError: (err: Error) =>
          toast("Could not update the bottle", { description: err.message, variant: "error" }),
      },
    );
  };
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Status of ${product.name}: ${current}`}
            className={cn(owned && "border-brand/50 bg-brand/10 text-brand")}
          >
            {current}
            <ChevronDown className="opacity-60" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-1">
          <fieldset className="grid">
            <legend className="sr-only">Stock</legend>
            <button
              type="button"
              className={menuItem}
              onClick={(): void => {
                setOpen(false);
                setBuying({ kind: "buy", productId: product.id, productName: product.name });
              }}
            >
              <PackagePlus className="size-4" aria-hidden />
              Bought a bottle…
            </button>
            {owned && (
              <button
                type="button"
                className={menuItem}
                onClick={(): void => {
                  setOpen(false);
                  setFinishing(true);
                }}
              >
                <PackageMinus className="size-4" aria-hidden />
                Ran out…
              </button>
            )}
          </fieldset>
          <div className="my-1 border-t" />
          <fieldset className="grid">
            <legend className="sr-only">Set status</legend>
            <p className="px-2 pt-1 pb-0.5 text-muted-foreground text-xs">
              Buying makes a bottle Owned; running out of the last one makes it Finished.
            </p>
            {[...PRODUCT_STATUSES, null].map((status) => (
              <button
                key={String(status)}
                type="button"
                aria-pressed={status === product.status}
                className={cn(menuItem, "justify-between")}
                disabled={setStatus.isPending}
                onClick={(): void => choose(status)}
              >
                {statusLabel(status)}
                <Check
                  className={cn("size-4 text-brand", status !== product.status && "invisible")}
                  aria-hidden
                />
              </button>
            ))}
          </fieldset>
        </PopoverContent>
      </Popover>
      <PurchaseSheet
        barId={barId}
        currency={currency}
        target={buying}
        onClose={(): void => setBuying(null)}
      />
      <RanOutSheet
        barId={barId}
        product={product}
        open={finishing}
        onClose={(): void => setFinishing(false)}
      />
    </>
  );
}

/** Confirms that the oldest open bottle ran out, on a date that defaults to today. */
function RanOutSheet({
  barId,
  product,
  open,
  onClose,
}: Readonly<{ barId: string; product: Product; open: boolean; onClose: () => void }>): JSX.Element {
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ran out of {product.name}?</SheetTitle>
          <SheetDescription>
            {product.stock.open_count > 1
              ? `The oldest of ${product.stock.open_count} open bottles is marked as finished.`
              : "The bottle is marked as finished."}
          </SheetDescription>
        </SheetHeader>
        {open && <RanOutForm barId={barId} product={product} onDone={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function RanOutForm({
  barId,
  product,
  onDone,
}: Readonly<{ barId: string; product: Product; onDone: () => void }>): JSX.Element {
  const id = useId();
  const [date, setDate] = useState(localToday);
  const finish = useFinishBottle(barId);
  return (
    <form
      className="flex flex-col gap-4 px-4"
      onSubmit={(event: SubmitEvent<HTMLFormElement>): void => {
        event.preventDefault();
        finish.mutate(
          { id: product.id, finished_on: date },
          {
            onSuccess: () => {
              toast(`Ran out of ${product.name}`);
              onDone();
            },
            onError: (err: Error) =>
              toast("Could not update the bottle", { description: err.message, variant: "error" }),
          },
        );
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={id}>Ran out on</Label>
        <Input
          id={id}
          type="date"
          required
          value={date}
          onChange={(e: ChangeEvent<HTMLInputElement>): void => setDate(e.target.value)}
        />
      </div>
      <SheetFooter className="px-0">
        <Button type="submit" disabled={finish.isPending || !date}>
          Ran out
        </Button>
      </SheetFooter>
    </form>
  );
}
