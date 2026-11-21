import { type BarSummary, countryName, hasRole, imageUrl, type Product } from "@larder/shared";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { type JSX, type ReactNode, useState } from "react";
import { z } from "zod";
import { ApiError } from "@/api/client.ts";
import { productQuery, useProductMutations, useSetBottleFavourite } from "@/api/products.ts";
import { badge } from "@/components/badge.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { FavouriteButton } from "@/components/favourite-button.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { BottleTastings } from "@/features/tastings/bottle-tastings.tsx";
import { BottleComments } from "./bottle-comments.tsx";
import { ProductSheet, type ProductTarget } from "./product-sheet.tsx";
import { PurchaseHistory } from "./purchase-history.tsx";
import { StockAction } from "./stock-action.tsx";

const route = getRouteApi("/bottles/$productId");

/** The bottle page's tabs; the open one lives in the URL so going back returns to it. */
const BOTTLE_TABS = ["details", "tastings", "stock", "comments"] as const;
type BottleTab = (typeof BOTTLE_TABS)[number];
export const bottleSearchSchema = z.object({
  tab: z.enum(BOTTLE_TABS).optional().catch(undefined),
});

/** A small count next to a tab label; nothing for zero. */
const Count = ({ value }: { value: number }): JSX.Element | null =>
  value > 0 ? (
    <span className={badge({ tone: "muted", className: "tabular-nums" })}>{value}</span>
  ) : null;

export function BottleDetailPage(): JSX.Element {
  const { productId }: { productId: string } = route.useParams();
  return (
    <BarGate title="Bottle">
      {(bar: BarSummary): JSX.Element => (
        <BottleView key={productId} bar={bar} productId={productId} />
      )}
    </BarGate>
  );
}

const BackLink = (): JSX.Element => (
  <Link
    to="/bottles"
    className="flex items-center gap-1 text-muted-foreground text-sm hover:underline"
  >
    <ArrowLeft className="size-4" aria-hidden />
    All bottles
  </Link>
);

function BottleView({
  bar,
  productId,
}: Readonly<{ bar: BarSummary; productId: string }>): JSX.Element {
  const product = useQuery(productQuery(bar.id, productId));
  let body: ReactNode;
  if (product.isPending) body = <LoadingState label="Loading bottle…" />;
  else if (product.isError) {
    body =
      product.error instanceof ApiError && product.error.code === "NOT_FOUND" ? (
        <EmptyState title="Bottle not found">It may have been deleted.</EmptyState>
      ) : (
        <ErrorState
          error={product.error}
          onRetry={(): ReturnType<typeof product.refetch> => product.refetch()}
        />
      );
  } else body = <BottleDetails bar={bar} product={product.data} />;
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4">
      <BackLink />
      {body}
    </section>
  );
}

function BottleDetails({
  bar,
  product,
}: Readonly<{ bar: BarSummary; product: Product }>): JSX.Element {
  const canEdit = hasRole(bar.role, "editor");
  const navigate = useNavigate();
  const tab = route.useSearch({
    select: (search: z.output<typeof bottleSearchSchema>) => search.tab ?? "details",
  });
  const { remove } = useProductMutations(bar.id);
  const setFavourite = useSetBottleFavourite(bar.id);
  const [target, setTarget] = useState<ProductTarget>(null);
  const [deleting, setDeleting] = useState(false);

  const facts: [string, string | number | null][] = [
    ["Category", product.category_name],
    ["Producer", product.producer],
    ["Country", product.country && countryName(product.country)],
    ["Region", product.region],
    ["ABV", product.abv === null ? null : `${product.abv}%`],
    ["Vintage", product.vintage],
    ["Age", product.age_years === null ? null : `${product.age_years} years`],
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 text-3xl">{product.name}</h1>
        <FavouriteButton
          favourite={product.is_favourite}
          disabled={setFavourite.pendingIds.includes(product.id)}
          onToggle={(favourite: boolean): void =>
            setFavourite.mutate({ id: product.id, favourite })
          }
        />
        <StockAction barId={bar.id} currency={bar.currency} product={product} canEdit={canEdit} />
        {canEdit && (
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label="Edit bottle"
              onClick={(): void => setTarget(product)}
            >
              <Pencil aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Delete bottle"
              onClick={(): void => setDeleting(true)}
            >
              <Trash2 aria-hidden />
            </Button>
          </>
        )}
      </div>

      <Tabs
        value={tab}
        onValueChange={(value: string): Promise<void> =>
          navigate({
            to: ".",
            search: { tab: value === "details" ? undefined : (value as BottleTab) },
            replace: true,
          })
        }
      >
        <TabsList aria-label="Bottle sections">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="tastings">
            Tastings <Count value={product.tasting_summary.count} />
          </TabsTrigger>
          <TabsTrigger value="stock">
            Stock <Count value={product.stock.open_count} />
          </TabsTrigger>
          <TabsTrigger value="comments">
            Comments <Count value={product.comment_count} />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          {product.image_id && (
            <img
              src={imageUrl(product.image_id)}
              alt={product.name}
              className="max-h-80 w-full rounded-lg object-cover sm:w-auto sm:self-start"
            />
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border bg-card p-4 text-sm shadow-xs sm:p-5">
            {facts
              .filter(([, value]) => value !== null)
              .map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          {product.description && <p className="whitespace-pre-line">{product.description}</p>}
        </TabsContent>
        <TabsContent value="tastings">
          <BottleTastings bar={bar} product={product} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="stock">
          <PurchaseHistory bar={bar} product={product} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="comments">
          <BottleComments bar={bar} product={product} canEdit={canEdit} />
        </TabsContent>
      </Tabs>

      <ProductSheet barId={bar.id} target={target} onClose={(): void => setTarget(null)} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${product.name}?`}
        description="This cannot be undone."
        onConfirm={async (): Promise<void> => {
          await remove.mutateAsync(product.id);
          toast(`Deleted ${product.name}`);
          await navigate({ to: "/bottles" });
        }}
      />
    </>
  );
}
