import type { Product } from "@larder/shared";
import { Check, Plus } from "lucide-react";
import { useSetProductInBar } from "@/api/products.ts";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";

/** One tap marks a bottle as in the bar or not. Viewers see the state without the button. */
export function InBarToggle({
  barId,
  product,
  canEdit,
}: {
  barId: string;
  product: Product;
  canEdit: boolean;
}) {
  const setInBar = useSetProductInBar(barId);
  const label = product.in_bar ? "In the bar" : "Not in the bar";
  if (!canEdit) {
    return product.in_bar ? <span className="text-muted-foreground text-xs">{label}</span> : null;
  }
  return (
    <Button
      variant={product.in_bar ? "default" : "outline"}
      size="sm"
      aria-pressed={product.in_bar}
      aria-label={`${product.name} in the bar`}
      disabled={setInBar.isPending}
      onClick={() =>
        setInBar.mutate(
          { id: product.id, in_bar: !product.in_bar },
          {
            onError: (err) =>
              toast("Could not update the bottle", { description: err.message, variant: "error" }),
          },
        )
      }
    >
      {product.in_bar ? <Check aria-hidden /> : <Plus aria-hidden />}
      {product.in_bar ? "In bar" : "Add to bar"}
    </Button>
  );
}
