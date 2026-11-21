import { type JSX, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";

export function DeleteBarButton({
  barName,
  onDelete,
}: Readonly<{ barName: string; onDelete: (name: string) => Promise<unknown> }>): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="destructive"
        onClick={(): void => setOpen(true)}
        aria-label={`Delete ${barName}`}
      >
        Delete bar
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${barName}?`}
        description="This permanently removes the bar and all its recipes, inventory and pictures."
        confirmLabel="Delete bar"
        confirmationText={barName}
        onConfirm={onDelete}
      />
    </>
  );
}
