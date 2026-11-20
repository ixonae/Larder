import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { api, unwrap } from "@/api/client.ts";
import { meQuery, signupSettingsQuery, useMe } from "@/api/queries.ts";
import { ErrorState, LoadingState } from "@/components/states.tsx";
import { NewAccountForm } from "./new-account-form.tsx";

export function SignUpLink() {
  const settings = useQuery(signupSettingsQuery);
  return settings.data?.signup_mode === "open" ? (
    <Link className="text-sm underline" to="/signup">
      Create an account
    </Link>
  ) : null;
}

export function SignUpPage() {
  const me = useMe();
  const settings = useQuery(signupSettingsQuery);
  const client = useQueryClient();
  const navigate = useNavigate();
  if (settings.isPending) return <LoadingState />;
  if (settings.isError)
    return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;
  const canRegister = settings.data.signup_mode === "open" && me.data === null;
  return (
    <section className="mx-auto grid max-w-sm gap-4">
      <h1 className="text-3xl">Create an account</h1>
      {canRegister ? (
        <NewAccountForm
          label="Create account"
          submit={async (json) => {
            await unwrap(await api.api.auth["sign-up"].$post({ json }));
            await client.invalidateQueries({ queryKey: meQuery.queryKey });
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
