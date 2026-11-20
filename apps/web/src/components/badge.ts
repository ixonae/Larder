import { cva } from "class-variance-authority";

/** A small rounded label, such as "≈ 18% ABV" or "Can make". */
export const badge = cva("shrink-0 rounded-full px-2 py-0.5 font-medium text-xs", {
  variants: {
    tone: {
      secondary: "bg-secondary text-secondary-foreground",
      brand: "bg-brand/10 text-brand",
      muted: "bg-muted text-muted-foreground",
      destructive: "bg-destructive/10 text-destructive",
    },
  },
  defaultVariants: { tone: "secondary" },
});
