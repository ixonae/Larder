import { cn } from "cn";
import { Search } from "lucide-react";
import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input.tsx";

/** A search box with a leading magnifier, for filtering a list page. */
export function SearchInput({ className, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
        aria-hidden
      />
      <Input type="search" className="pl-8" {...props} />
    </div>
  );
}
