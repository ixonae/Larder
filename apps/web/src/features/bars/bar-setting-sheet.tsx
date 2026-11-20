import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet.tsx";

/** An owner's bar setting: a button that opens a sheet holding its form, closed once saved. */
export function BarSettingSheet({
  label,
  ariaLabel,
  title,
  description,
  children,
}: Readonly<{
  label: string;
  ariaLabel: string;
  title: string;
  description: string;
  children: (onSaved: () => void) => ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" aria-label={ariaLabel}>
          {label}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {children(() => setOpen(false))}
      </SheetContent>
    </Sheet>
  );
}
