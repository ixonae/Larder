import { type BarSummary, hasRole, imageUrl, type Product } from "@larder/shared";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ApiError } from "@/api/client.ts";
import { productQuery, useProductMutations } from "@/api/products.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";
import { InBarToggle } from "./in-bar-toggle.tsx";
import { ProductSheet, type ProductTarget } from "./product-sheet.tsx";

const route = getRouteApi("/bottles/$productId");

export function BottleDetailPage() {
  const { productId } = route.useParams();
  return (
    <BarGate title="Bottle">
      {(bar) => <BottleView key={productId} bar={bar} productId={productId} />}
    </BarGate>
  );
}

const BackLink = () => (
  <Link
    to="/bottles"
    className="flex items-center gap-1 text-muted-foreground text-sm hover:underline"
  >
    <ArrowLeft className="size-4" aria-hidden />
    All bottles
  </Link>
);

function BottleView({ bar, productId }: { bar: BarSummary; productId: string }) {
  const product = useQuery(productQuery(bar.id, productId));
  let body: ReactNode;
  if (product.isPending) body = <LoadingState label="Loading bottle…" />;
  else if (product.isError) {
    body =
      product.error instanceof ApiError && product.error.code === "NOT_FOUND" ? (
        <EmptyState title="Bottle not found">It may have been deleted.</EmptyState>
      ) : (
        <ErrorState error={product.error} onRetry={() => product.refetch()} />
      );
  } else body = <BottleDetails bar={bar} product={product.data} />;
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4">
      <BackLink />
      {body}
    </section>
  );
}

function BottleDetails({ bar, product }: { bar: BarSummary; product: Product }) {
  const canEdit = hasRole(bar.role, "editor");
  const navigate = useNavigate();
  const { remove } = useProductMutations(bar.id);
  const [target, setTarget] = useState<ProductTarget>(null);
  const [deleting, setDeleting] = useState(false);

  const facts: [string, string | number | null][] = [
    ["Category", product.category_name],
    ["Producer", product.producer],
    ["Country", product.country],
    ["Region", product.region],
    ["ABV", product.abv === null ? null : `${product.abv}%`],
    ["Vintage", product.vintage],
    ["Age", product.age_years === null ? null : `${product.age_years} years`],
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 text-3xl">{product.name}</h1>
        <InBarToggle barId={bar.id} product={product} canEdit={canEdit} />
        {canEdit && (
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label="Edit bottle"
              onClick={() => setTarget(product)}
            >
              <Pencil aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Delete bottle"
              onClick={() => setDeleting(true)}
            >
              <Trash2 aria-hidden />
            </Button>
          </>
        )}
      </div>

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

      <ProductSheet barId={bar.id} target={target} onClose={() => setTarget(null)} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${product.name}?`}
        description="This cannot be undone."
        onConfirm={async () => {
          await remove.mutateAsync(product.id);
          toast(`Deleted ${product.name}`);
          await navigate({ to: "/bottles" });
        }}
      />
    </>
  );
}
