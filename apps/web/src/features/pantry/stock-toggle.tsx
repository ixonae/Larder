import type { PantryIngredient } from "@larder/shared";
import { Infinity as Always, Check, Plus } from "lucide-react";
import { useSetPantryStock } from "@/api/pantry.ts";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";

/**
 * A staple shows a badge: it counts as available whatever its stock. Anything else gets a one-tap
 * in/out of stock toggle; viewers only see the state.
 */
export function StockToggle({
  barId,
  ingredient,
  canEdit,
}: Readonly<{
  barId: string;
  ingredient: PantryIngredient;
  canEdit: boolean;
}>) {
  const setStock = useSetPantryStock(barId);
  if (ingredient.always_available) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 font-medium text-secondary-foreground text-xs">
        <Always className="size-3.5" aria-hidden />
        Always available
      </span>
    );
  }
  const label = ingredient.in_stock ? "In stock" : "Out of stock";
  if (!canEdit) return <span className="text-muted-foreground text-xs">{label}</span>;
  return (
    <Button
      variant={ingredient.in_stock ? "default" : "outline"}
      size="sm"
      aria-pressed={ingredient.in_stock}
      aria-label={`${ingredient.name} in stock`}
      disabled={setStock.isPending}
      onClick={() =>
        setStock.mutate(
          { id: ingredient.id, in_stock: !ingredient.in_stock },
          {
            onError: (err) =>
              toast(`Could not update ${ingredient.name}`, {
                description: err.message,
                variant: "error",
              }),
          },
        )
      }
    >
      {ingredient.in_stock ? <Check aria-hidden /> : <Plus aria-hidden />}
      {label}
    </Button>
  );
}
