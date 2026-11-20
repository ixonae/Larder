import { type NewAccount, newAccountSchema } from "@larder/shared";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { FormError, FormField, PasswordField, useZodForm } from "@/lib/form.tsx";

export function NewAccountForm({
  submit,
  label,
}: Readonly<{ submit: (data: NewAccount) => Promise<unknown>; label: string }>) {
  const form = useZodForm(newAccountSchema);
  const create = useMutation({ mutationFn: submit, onSuccess: () => form.reset() });
  return (
    <form
      className="grid gap-3"
      noValidate
      onSubmit={form.handleSubmit((data) => create.mutate(data))}
    >
      <FormField form={form} name="display_name" label="Display name">
        {(control) => <Input {...control} {...form.register("display_name")} autoComplete="name" />}
      </FormField>
      <FormField form={form} name="email" label="Email">
        {(control) => (
          <Input {...control} {...form.register("email")} type="email" autoComplete="username" />
        )}
      </FormField>
      <PasswordField
        form={form}
        name="password"
        label="Password"
        autoComplete="new-password"
        lengthHint
      />
      <FormError error={create.error} />
      <Button type="submit" disabled={create.isPending}>
        {label}
      </Button>
    </form>
  );
}
