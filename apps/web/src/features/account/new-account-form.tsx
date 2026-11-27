import { type NewAccount, newAccountSchema } from "@larder/shared";
import type { JSX } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { type ControlProps, FormError, FormField, PasswordField, useZodForm } from "@/lib/form.tsx";
import { useCredentialSubmit } from "./credential-submit.ts";

export function NewAccountForm({
  submit,
  label,
}: Readonly<{ submit: (data: NewAccount) => Promise<unknown>; label: string }>): JSX.Element {
  const form = useZodForm(newAccountSchema);
  const create = useCredentialSubmit(async (data: NewAccount) => {
    await submit(data);
    form.reset();
  });
  return (
    <form className="grid gap-3" noValidate onSubmit={form.handleSubmit(create.submit)}>
      <FormField form={form} name="display_name" label="Display name">
        {(control: ControlProps): JSX.Element => (
          <Input {...control} {...form.register("display_name")} autoComplete="name" />
        )}
      </FormField>
      <FormField form={form} name="email" label="Email">
        {(control: ControlProps): JSX.Element => (
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
