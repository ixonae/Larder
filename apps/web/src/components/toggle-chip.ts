import { cva } from "class-variance-authority";

/** A label styled as a toggle chip around a visually hidden checkbox (`sr-only`). */
export const toggleChip = cva(
  "flex cursor-pointer select-none items-center gap-1.5 rounded-full border transition-colors hover:bg-muted has-[:checked]:border-brand/50 has-[:checked]:bg-brand/10 has-[:checked]:text-brand has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
  {
    variants: {
      size: { sm: "h-7 px-2.5 text-xs", md: "h-8 px-3 text-sm" },
    },
    defaultVariants: { size: "md" },
  },
);
