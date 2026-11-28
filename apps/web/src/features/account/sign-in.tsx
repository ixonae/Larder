import { type SignIn, signInSchema } from "@larder/shared";
import { useQueryClient } from "@tanstack/react-query";
import type { JSX } from "react";
import { api, unwrap } from "@/api/client.ts";
import { signedIn } from "@/api/session.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { type ControlProps, FormError, FormField, PasswordField, useZodForm } from "@/lib/form.tsx";
import { useCredentialSubmit } from "./credential-submit.ts";

export function SignInForm(): JSX.Element {
  const client = useQueryClient();
  const form = useZodForm(signInSchema);
  const signIn = useCredentialSubmit(async (credentials: SignIn) => {
    await unwrap(await api.api.auth["sign-in"].$post({ json: credentials }));
    await signedIn(client);
  });

  return (
    <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(signIn.submit)}>
      <FormField form={form} name="email" label="Email">
        {(control: ControlProps): JSX.Element => (
          <Input {...control} {...form.register("email")} type="email" autoComplete="username" />
        )}
      </FormField>
      <PasswordField form={form} name="password" label="Password" autoComplete="current-password" />
      <FormError error={signIn.error} />
      <Button disabled={signIn.isPending} type="submit">
        Sign in
      </Button>
    </form>
  );
}
