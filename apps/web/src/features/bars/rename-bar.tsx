import { type BarSummary, type RenameBar, renameBarSchema } from "@larder/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, unwrap } from "@/api/client.ts";
import { meQuery } from "@/api/queries.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet.tsx";
import { FormError, FormField, useZodForm } from "@/lib/form.tsx";

type NamedBar = Pick<BarSummary, "id" | "name">;

export function RenameBarButton({ bar }: Readonly<{ bar: NamedBar }>) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" aria-label={`Rename ${bar.name}`}>
          Rename
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>Rename bar</SheetTitle>
          <SheetDescription>
            The new name will be visible to all members of this bar.
          </SheetDescription>
        </SheetHeader>
        <RenameForm bar={bar} onSaved={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function RenameForm({ bar, onSaved }: Readonly<{ bar: NamedBar; onSaved: () => void }>) {
  const client = useQueryClient();
  const form = useZodForm(renameBarSchema, { defaultValues: { name: bar.name } });
  const rename = useMutation({
    mutationFn: async (json: RenameBar) =>
      unwrap(await api.api.bars[":barId"].$patch({ param: { barId: bar.id }, json })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: meQuery.queryKey });
      onSaved();
    },
  });
  return (
    <form
      className="grid gap-4 px-6 pb-6"
      onSubmit={form.handleSubmit((data) => rename.mutate(data))}
    >
      <FormField form={form} name="name" label="Bar name">
        {(control) => <Input {...control} {...form.register("name")} />}
      </FormField>
      <FormError error={rename.error} />
      <Button disabled={rename.isPending} type="submit">
        Save name
      </Button>
    </form>
  );
}
