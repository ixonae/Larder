import { type BarSummary, barFieldsSchema } from "@larder/shared";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { FormError, FormField, useZodForm } from "@/lib/form.tsx";
import { BarSettingSheet } from "./bar-setting-sheet.tsx";
import { useUpdateBar } from "./update-bar.ts";

const renameSchema = barFieldsSchema.pick({ name: true });

type NamedBar = Pick<BarSummary, "id" | "name">;

export function RenameBarButton({ bar }: Readonly<{ bar: NamedBar }>) {
  return (
    <BarSettingSheet
      label="Rename"
      ariaLabel={`Rename ${bar.name}`}
      title="Rename bar"
      description="The new name will be visible to all members of this bar."
    >
      {(onSaved) => <RenameForm bar={bar} onSaved={onSaved} />}
    </BarSettingSheet>
  );
}

function RenameForm({ bar, onSaved }: Readonly<{ bar: NamedBar; onSaved: () => void }>) {
  const form = useZodForm(renameSchema, { defaultValues: { name: bar.name } });
  const rename = useUpdateBar(bar.id, onSaved);
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
