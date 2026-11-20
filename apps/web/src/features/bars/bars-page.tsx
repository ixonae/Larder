import { type BarSummary, type CreateBar, createBarSchema, DEFAULT_CURRENCY } from "@larder/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client.ts";
import { meQuery } from "@/api/queries.ts";
import { currencyLabel, currencyPicker } from "@/components/currency-options.ts";
import { ErrorState, LoadingState } from "@/components/states.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ComboboxField, FormError, FormField, useZodForm } from "@/lib/form.tsx";
import { useSignedIn } from "./active-bar.tsx";
import { ChangeCurrencyButton } from "./bar-currency.tsx";
import { DeleteBarButton } from "./delete-bar.tsx";
import { InvitationManager } from "./invitation-manager.tsx";
import { RenameBarButton } from "./rename-bar.tsx";

export function BarsPage() {
  const { me, bar, enterBar } = useSignedIn();
  const client = useQueryClient();
  return (
    <section className="mx-auto grid w-full max-w-5xl gap-6">
      <h1 className="text-3xl">Bars</h1>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="grid min-w-0 gap-4">
          <section className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="text-xl">Your bars</h2>
            {me.bars.length ? (
              <ul aria-label="Your bars" className="divide-y">
                {me.bars.map(({ id, name, currency, role }) => (
                  <li
                    key={id}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-medium">{name}</p>
                      <p className="text-muted-foreground text-sm capitalize">{role}</p>
                      <p className="text-muted-foreground text-sm">
                        Currency: {currencyLabel(currency)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
                      {role === "owner" && (
                        <>
                          <RenameBarButton bar={{ id, name }} />
                          <ChangeCurrencyButton bar={{ id, name, currency }} />
                        </>
                      )}
                      <Button
                        variant="outline"
                        aria-label={`Open ${name}`}
                        onClick={() => void enterBar(id)}
                      >
                        Open
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                Create a bar or use an invitation link to join one.
              </p>
            )}
          </section>
          <NewBarForm onCreate={enterBar} />
        </div>
        <div className="grid min-w-0 gap-4">
          {bar && <Members bar={bar} />}
          {bar?.role === "owner" && (
            <div className="min-w-0 rounded-xl border bg-card p-4 sm:p-5">
              <InvitationManager bar={bar} />
            </div>
          )}
          <section className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="text-xl">Permissions</h2>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="font-medium">Installation admin</dt>
                <dd className="text-muted-foreground">
                  Manages users and signup and can delete any bar.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Bar owner</dt>
                <dd className="text-muted-foreground">
                  Can edit bar data, manage invitations, and delete their bar.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Editor</dt>
                <dd className="text-muted-foreground">
                  Can edit recipes, inventory, and the bar catalogue.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Viewer</dt>
                <dd className="text-muted-foreground">Can browse bar data.</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
      {bar?.role === "owner" && (
        <section
          aria-labelledby="bar-deletion"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-card p-4 sm:p-5"
        >
          <div className="min-w-0">
            <h2 id="bar-deletion" className="text-xl">
              Delete bar
            </h2>
            <p className="mt-1 break-words text-muted-foreground text-sm">
              Permanently remove {bar.name} and all of its data.
            </p>
          </div>
          <DeleteBarButton
            barName={bar.name}
            onDelete={async (name) => {
              await unwrap(
                await api.api.bars[":barId"].$delete({ param: { barId: bar.id }, json: { name } }),
              );
              await client.invalidateQueries({ queryKey: meQuery.queryKey });
            }}
          />
        </section>
      )}
    </section>
  );
}

function NewBarForm({ onCreate }: Readonly<{ onCreate: (id: string) => Promise<void> }>) {
  const client = useQueryClient();
  const form = useZodForm(createBarSchema, {
    defaultValues: { currency: DEFAULT_CURRENCY, seed_data: false },
  });
  const create = useMutation({
    mutationFn: async (data: CreateBar) => unwrap(await api.api.bars.$post({ json: data })),
    onSuccess: async ({ id }) => {
      await client.invalidateQueries({ queryKey: meQuery.queryKey });
      await onCreate(id);
    },
  });
  return (
    <form
      className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5"
      onSubmit={form.handleSubmit((data) => create.mutate(data))}
    >
      <h2 className="text-xl">Create a bar</h2>
      <FormField form={form} name="name" label="Bar name">
        {(control) => <Input {...control} {...form.register("name")} />}
      </FormField>
      <ComboboxField form={form} name="currency" label="Currency" {...currencyPicker} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...form.register("seed_data")} />
        Add starter recipes and catalogue
      </label>
      <FormError error={create.error} />
      <Button type="submit" disabled={create.isPending} className="justify-self-start">
        Create bar
      </Button>
    </form>
  );
}

function Members({ bar }: Readonly<{ bar: BarSummary }>) {
  const result = useQuery({
    queryKey: ["bars", bar.id, "members"],
    queryFn: async () =>
      unwrap(await api.api.bars[":barId"].members.$get({ param: { barId: bar.id } })),
  });
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="break-words text-xl">Members of {bar.name}</h2>
      {result.isPending && <LoadingState />}
      {result.isError && <ErrorState error={result.error} onRetry={() => result.refetch()} />}
      {result.data && (
        <ul className="divide-y">
          {result.data.members.map((member) => (
            <li key={member.id} className="flex justify-between gap-2 py-2">
              <span className="min-w-0 break-words">{member.display_name}</span>
              <span className="text-muted-foreground text-sm capitalize">{member.role}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
