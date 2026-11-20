import { type SignupSettings, searchKey } from "@larder/shared";
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, ShieldCheck, UsersRound } from "lucide-react";
import { Tabs } from "radix-ui";
import { type ReactNode, useState } from "react";
import { api, unwrap } from "@/api/client.ts";
import { meQuery, signupSettingsQuery } from "@/api/queries.ts";
import { SearchInput } from "@/components/search-input.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet.tsx";
import { NewAccountForm } from "@/features/account/new-account-form.tsx";
import { useSignedIn } from "@/features/bars/active-bar.tsx";
import { DeleteBarButton } from "@/features/bars/delete-bar.tsx";
import { FormError } from "@/lib/form.tsx";
import { adminUsersKey, UserDirectory } from "./user-directory.tsx";

const ADMIN_BARS = ["administration", "bars"];
const adminTabs = [
  { id: "users", label: "Users", icon: UsersRound },
  { id: "signup", label: "Signup policy", icon: ShieldCheck },
  { id: "bars", label: "Bars", icon: Building2 },
] as const;

export function AdminPage() {
  const { me } = useSignedIn();
  return (
    <section className="mx-auto grid w-full max-w-5xl gap-6">
      <header>
        <h1 className="text-3xl">Administration</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Manage accounts, signup, and bars across this installation.
        </p>
      </header>
      {me.user.is_admin ? (
        <Tabs.Root defaultValue="users">
          <Tabs.List
            aria-label="Administration sections"
            className="mb-5 flex gap-1 overflow-x-auto border-b"
          >
            {adminTabs.map(({ id, label, icon: Icon }) => (
              <Tabs.Trigger
                key={id}
                value={id}
                className="flex shrink-0 items-center gap-2 border-transparent border-b-2 px-3 py-2.5 font-medium text-muted-foreground text-sm hover:text-foreground data-[state=active]:border-brand data-[state=active]:text-foreground"
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="users">
            <UsersPanel />
          </Tabs.Content>
          <Tabs.Content value="signup">
            <SignupPanel />
          </Tabs.Content>
          <Tabs.Content value="bars">
            <BarsPanel />
          </Tabs.Content>
        </Tabs.Root>
      ) : (
        <EmptyState title="Admin access required" />
      )}
    </section>
  );
}

function AdminData<T>({
  result,
  children,
}: Readonly<{ result: UseQueryResult<T>; children: (data: T) => ReactNode }>) {
  if (result.isPending) return <LoadingState />;
  if (result.isError) return <ErrorState error={result.error} onRetry={() => result.refetch()} />;
  return children(result.data);
}

function UsersPanel() {
  const [query, setQuery] = useState("");
  const result = useQuery({
    queryKey: adminUsersKey,
    queryFn: async () => unwrap(await api.api.admin.users.$get()),
  });

  return (
    <AdminData result={result}>
      {({ users }) => {
        const search = searchKey(query.trim());
        const filtered = users.filter(
          ({ display_name, email }) =>
            searchKey(display_name).includes(search) || searchKey(email).includes(search),
        );
        return (
          <section className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl">User accounts</h2>
              <CreateUser />
            </div>
            <SearchInput
              className="max-w-sm"
              aria-label="Search users"
              placeholder="Search name or email"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            {filtered.length ? (
              <UserDirectory users={filtered} />
            ) : (
              <EmptyState title="No matching users" />
            )}
          </section>
        );
      }}
    </AdminData>
  );
}

function CreateUser() {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden />
          Add user
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>Add user</SheetTitle>
          <SheetDescription>Set an initial password for this account.</SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6">
          <NewAccountForm
            label="Create user"
            submit={async (json) => {
              await unwrap(await api.api.admin.users.$post({ json }));
              await client.invalidateQueries({ queryKey: adminUsersKey });
              setOpen(false);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

const signupOptions = [
  {
    value: "invite_only",
    label: "Invite only",
    summary: "A bar invitation is required to create an account.",
  },
  {
    value: "open",
    label: "Open signup",
    summary: "Anyone with the site link can create an account from the sign-in page.",
  },
  {
    value: "closed",
    label: "Admins only",
    summary: "Admins create accounts. Existing accounts can still accept invitations.",
  },
] as const;

function SignupPanel() {
  const result = useQuery(signupSettingsQuery);
  return <AdminData result={result}>{(settings) => <SignupMode settings={settings} />}</AdminData>;
}

function SignupMode({ settings }: Readonly<{ settings: SignupSettings }>) {
  const [selected, select] = useState(settings.signup_mode);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: async () =>
      unwrap(await api.api.admin["signup-settings"].$patch({ json: { signup_mode: selected } })),
    onSuccess: (data) => client.setQueryData(signupSettingsQuery.queryKey, data),
  });
  return (
    <form
      className="grid max-w-2xl gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-xl">Who can create an account?</legend>
        {signupOptions.map(({ value, label, summary }) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 has-checked:border-brand"
          >
            <input
              className="mt-1 accent-brand"
              type="radio"
              name="signup-mode"
              value={value}
              checked={selected === value}
              onChange={() => select(value)}
              aria-label={label}
            />
            <span className="grid gap-1">
              <span className="font-medium text-sm">{label}</span>
              <span className="text-muted-foreground text-sm">{summary}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <FormError error={save.error} />
      {save.isSuccess && (
        <p role="status" className="text-sm">
          Signup policy updated.
        </p>
      )}
      <Button
        type="submit"
        disabled={save.isPending || selected === settings.signup_mode}
        className="justify-self-start"
      >
        Save signup policy
      </Button>
    </form>
  );
}

function BarsPanel() {
  const client = useQueryClient();
  const result = useQuery({
    queryKey: ADMIN_BARS,
    queryFn: async () => unwrap(await api.api.admin.bars.$get()),
  });
  return (
    <AdminData result={result}>
      {({ bars }) => (
        <section className="grid gap-4">
          <h2 className="text-xl">All bars</h2>
          {bars.length ? (
            <ul className="divide-y rounded-xl border bg-card px-4 sm:px-5">
              {bars.map(({ id, name, owner }) => (
                <li key={id} className="flex items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{name}</p>
                    <p className="text-muted-foreground text-sm">Owned by {owner.display_name}</p>
                  </div>
                  <DeleteBarButton
                    barName={name}
                    onDelete={async (confirmedName) => {
                      await unwrap(
                        await api.api.admin.bars[":id"].$delete({
                          param: { id },
                          json: { name: confirmedName },
                        }),
                      );
                      await Promise.all([
                        client.invalidateQueries({ queryKey: ADMIN_BARS }),
                        client.invalidateQueries({ queryKey: meQuery.queryKey }),
                      ]);
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No bars" />
          )}
        </section>
      )}
    </AdminData>
  );
}
