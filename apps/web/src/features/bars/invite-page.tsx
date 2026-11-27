import { type BarSummary, invitationTokenSchema, type NewAccount } from "@larder/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { type JSX, useState } from "react";
import { api, unwrap } from "@/api/client.ts";
import { meQuery, useMe } from "@/api/queries.ts";
import { signedIn } from "@/api/session.ts";
import { ErrorState, LoadingState } from "@/components/states.tsx";
import { Button } from "@/components/ui/button.tsx";
import { NewAccountForm } from "@/features/account/new-account-form.tsx";
import { SignInForm } from "@/features/account/sign-in.tsx";
import { FormError } from "@/lib/form.tsx";
import { useSignedIn } from "./active-bar.tsx";

const invitationKey = (token: string): string[] => ["invitation", token];

export function InvitePage(): JSX.Element {
  const hash = useLocation({ select: (location: { hash: string }) => location.hash });
  const token = invitationTokenSchema.safeParse(hash);
  if (!token.success) return <p role="alert">This invitation link is invalid.</p>;
  return <Invitation token={token.data} />;
}

function Invitation({ token }: Readonly<{ token: string }>): JSX.Element {
  const me = useMe();
  const preview = useQuery({
    queryKey: invitationKey(token),
    queryFn: async () => unwrap(await api.api.invitations.preview.$post({ json: { token } })),
  });
  if (preview.isPending) return <LoadingState />;
  if (preview.isError)
    return (
      <ErrorState
        error={preview.error}
        onRetry={(): ReturnType<typeof preview.refetch> => preview.refetch()}
      />
    );

  return (
    <section className="mx-auto grid max-w-sm gap-4">
      <h1 className="text-3xl">Join {preview.data.bar_name}</h1>
      <p className="text-muted-foreground text-sm">
        You’re invited as {preview.data.role === "editor" ? "an editor" : "a viewer"}.
      </p>
      {me.data ? (
        <AcceptButton token={token} />
      ) : (
        <JoinForms token={token} canRegister={preview.data.can_register} />
      )}
      <Link to="/cocktails" className="text-sm underline">
        Back to Larder
      </Link>
    </section>
  );
}

function AcceptButton({ token }: Readonly<{ token: string }>): JSX.Element {
  const client = useQueryClient();
  const selection = useSignedIn();
  const accept = useMutation({
    mutationFn: async () => unwrap(await api.api.invitations.accept.$post({ json: { token } })),
    onSuccess: async ({ id }: Pick<BarSummary, "id">) => {
      await client.invalidateQueries({ queryKey: meQuery.queryKey });
      await selection.enterBar(id);
      client.removeQueries({ queryKey: invitationKey(token) });
    },
  });
  return (
    <>
      <FormError error={accept.error} />
      <Button disabled={accept.isPending} onClick={(): void => accept.mutate()}>
        Accept invitation
      </Button>
    </>
  );
}

function JoinForms({
  token,
  canRegister,
}: Readonly<{ token: string; canRegister: boolean }>): JSX.Element {
  const [hasAccount, setHasAccount] = useState(false);
  if (!canRegister) return <SignInForm />;
  return (
    <>
      {hasAccount ? <SignInForm /> : <RegisterForm token={token} />}
      <Button variant="outline" onClick={(): void => setHasAccount(!hasAccount)}>
        {hasAccount ? "Create an account instead" : "I already have an account"}
      </Button>
    </>
  );
}

function RegisterForm({ token }: Readonly<{ token: string }>): JSX.Element {
  const client = useQueryClient();
  const navigate = useNavigate();
  return (
    <NewAccountForm
      label="Create account and join"
      submit={async (json: NewAccount): Promise<void> => {
        await unwrap(await api.api.invitations.register.$post({ json: { ...json, token } }));
        await signedIn(client);
        await navigate({ to: "/cocktails" });
        client.removeQueries({ queryKey: invitationKey(token) });
      }}
    />
  );
}
