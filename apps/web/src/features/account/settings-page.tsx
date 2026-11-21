import {
  type ChangeEmail,
  type ChangePassword,
  changeEmailSchema,
  changePasswordSchema,
} from "@larder/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleUserRound, KeyRound, Mail, ShieldCheck } from "lucide-react";
import type { JSX } from "react";
import { api, unwrap } from "@/api/client.ts";
import { meQuery } from "@/api/queries.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useSignedIn } from "@/features/bars/active-bar.tsx";
import { type ControlProps, FormError, FormField, PasswordField, useZodForm } from "@/lib/form.tsx";

export function SettingsPage(): JSX.Element {
  const { user } = useSignedIn().me;
  return (
    <section className="mx-auto grid w-full max-w-5xl gap-6">
      <h1 className="text-3xl">Account settings</h1>
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4 sm:p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CircleUserRound className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-medium">{user.display_name}</p>
          <p className="break-all text-muted-foreground text-sm">{user.email}</p>
        </div>
      </div>
      {user.is_admin && (
        <Link
          to="/admin"
          className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 font-medium text-sm hover:bg-accent md:hidden"
        >
          <ShieldCheck className="size-4" aria-hidden />
          Administration
        </Link>
      )}
      <section className="grid gap-3" aria-labelledby="sign-in-security">
        <div>
          <h2 id="sign-in-security" className="text-xl">
            Sign-in and security
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Changing your email or password signs out your other sessions.
          </p>
        </div>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <EmailForm email={user.email} />
          <PasswordForm />
        </div>
      </section>
    </section>
  );
}

function EmailForm({ email }: Readonly<{ email: string }>): JSX.Element {
  const client = useQueryClient();
  const form = useZodForm(changeEmailSchema, { defaultValues: { email, current_password: "" } });
  const change = useMutation({
    mutationFn: async (json: ChangeEmail) => unwrap(await api.api.me.email.$patch({ json })),
    onSuccess: async (_result: unknown, { email }: { current_password: string; email: string }) => {
      form.reset({ email, current_password: "" });
      await client.invalidateQueries({ queryKey: meQuery.queryKey });
    },
  });
  return (
    <form
      className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5"
      noValidate
      onSubmit={form.handleSubmit((data) => change.mutate(data))}
    >
      <h3 className="flex items-center gap-2 font-semibold">
        <Mail className="size-4 text-muted-foreground" aria-hidden />
        Change email
      </h3>
      <FormField form={form} name="email" label="Email">
        {(control: ControlProps): JSX.Element => (
          <Input {...control} {...form.register("email")} type="email" autoComplete="email" />
        )}
      </FormField>
      <PasswordField
        form={form}
        name="current_password"
        label="Current password"
        autoComplete="current-password"
      />
      <FormError error={change.error} />
      {change.isSuccess && <output className="text-sm">Email updated.</output>}
      <Button disabled={change.isPending} type="submit" className="justify-self-start">
        Save email
      </Button>
    </form>
  );
}

function PasswordForm(): JSX.Element {
  const form = useZodForm(changePasswordSchema);
  const change = useMutation({
    mutationFn: async (json: ChangePassword) => unwrap(await api.api.me.password.$patch({ json })),
    onSuccess: () => form.reset(),
  });
  return (
    <form
      className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5"
      noValidate
      onSubmit={form.handleSubmit((data) => change.mutate(data))}
    >
      <h3 className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4 text-muted-foreground" aria-hidden />
        Change password
      </h3>
      <PasswordField
        form={form}
        name="current_password"
        label="Current password"
        autoComplete="current-password"
      />
      <PasswordField
        form={form}
        name="new_password"
        label="New password"
        autoComplete="new-password"
        lengthHint
      />
      <PasswordField
        form={form}
        name="confirm_password"
        label="Confirm new password"
        autoComplete="new-password"
      />
      <FormError error={change.error} />
      {change.isSuccess && (
        <output className="text-sm">Password updated. Other sessions were signed out.</output>
      )}
      <Button disabled={change.isPending} type="submit" className="justify-self-start">
        Save password
      </Button>
    </form>
  );
}
