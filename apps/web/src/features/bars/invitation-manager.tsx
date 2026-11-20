import { type BarSummary, type CreateInvitation, createInvitationSchema } from "@larder/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client.ts";
import { ErrorState, LoadingState } from "@/components/states.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { FormError, FormField, useZodForm } from "@/lib/form.tsx";

export function InvitationManager({ bar }: Readonly<{ bar: BarSummary }>) {
  const client = useQueryClient();
  const param = { barId: bar.id };
  const endpoint = api.api.bars[":barId"].invitations;
  const queryKey = ["bars", bar.id, "invitations"];
  const pending = useQuery({
    queryKey,
    queryFn: async () => unwrap(await endpoint.$get({ param })),
  });
  const form = useZodForm(createInvitationSchema, { defaultValues: { role: "viewer" } });
  const create = useMutation({
    mutationFn: async (data: CreateInvitation) =>
      unwrap(await endpoint.$post({ param, json: data })),
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await endpoint[":id"].$delete({ param: { ...param, id } })),
    onSuccess: (_response, id) => {
      if (create.data?.id === id) create.reset();
      return client.invalidateQueries({ queryKey });
    },
  });
  const error = create.error ?? revoke.error;
  return (
    <section className="grid gap-3">
      <h2 className="break-words text-xl">Invite to {bar.name}</h2>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={form.handleSubmit((data) => create.mutate(data))}
      >
        <FormField form={form} name="role" label="Invitation role">
          {(control) => (
            <select
              {...control}
              {...form.register("role")}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          )}
        </FormField>
        <Button type="submit" disabled={create.isPending}>
          Create invite link
        </Button>
      </form>
      {create.data && (
        <div className="grid gap-1.5">
          <label htmlFor="invite-link" className="font-medium text-sm">
            Invitation link
          </label>
          <Input
            id="invite-link"
            readOnly
            value={create.data.url}
            onFocus={(event) => event.currentTarget.select()}
          />
          <p className="text-muted-foreground text-sm">
            Share this single-use link. It expires in seven days.
          </p>
        </div>
      )}
      <FormError error={error} />
      {pending.isPending && <LoadingState />}
      {pending.isError && <ErrorState error={pending.error} onRetry={() => pending.refetch()} />}
      {pending.data && pending.data.invitations.length > 0 && (
        <ul aria-label="Pending invitations" className="divide-y rounded-lg border px-3">
          {pending.data.invitations.map(({ id, role, expires_at }) => (
            <li key={id} className="flex items-center justify-between gap-2 py-2">
              <div>
                <p className="capitalize">{role} invitation</p>
                <p className="text-muted-foreground text-sm">
                  Expires {new Date(expires_at).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(id)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
