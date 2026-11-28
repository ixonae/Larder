import type { NewAccount } from "@larder/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { JSX } from "react";
import { api, unwrap } from "@/api/client.ts";
import { signupSettingsQuery, useMe } from "@/api/queries.ts";
import { signedIn } from "@/api/session.ts";
import { ErrorState, LoadingState } from "@/components/states.tsx";
import { NewAccountForm } from "./new-account-form.tsx";

export function SignUpLink(): JSX.Element | null {
  const settings = useQuery(signupSettingsQuery);
  return settings.data?.signup_mode === "open" ? (
    <Link className="text-sm underline" to="/signup">
      Create an account
    </Link>
  ) : null;
}

export function SignUpPage(): JSX.Element {
  const me = useMe();
  const settings = useQuery(signupSettingsQuery);
  const client = useQueryClient();
  const navigate = useNavigate();
  if (settings.isPending) return <LoadingState />;
  if (settings.isError)
    return (
      <ErrorState
        error={settings.error}
        onRetry={(): ReturnType<typeof settings.refetch> => settings.refetch()}
      />
    );
  const canRegister = settings.data.signup_mode === "open" && me.data === null;
  return (
    <section className="mx-auto grid max-w-sm gap-4">
      <h1 className="text-3xl">Create an account</h1>
      {canRegister ? (
        <NewAccountForm
          label="Create account"
          submit={async (json: NewAccount): Promise<void> => {
            await unwrap(await api.api.auth["sign-up"].$post({ json }));
            await signedIn(client);
            await navigate({ to: "/bars" });
          }}
        />
      ) : (
        <p>{me.data ? "You’re already signed in." : "Public signup is closed."}</p>
      )}
      <Link className="text-sm underline" to="/cocktails">
        Back to Larder
      </Link>
    </section>
  );
}
