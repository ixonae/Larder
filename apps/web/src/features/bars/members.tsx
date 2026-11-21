import type { BarMember, BarSummary, UpdateBarMember } from "@larder/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, unwrap } from "@/api/client.ts";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { ErrorState, LoadingState } from "@/components/states.tsx";
import { Button } from "@/components/ui/button.tsx";
import { FormError } from "@/lib/form.tsx";

export function Members({ bar }: Readonly<{ bar: BarSummary }>) {
  const client = useQueryClient();
  const queryKey = ["bars", bar.id, "members"];
  const result = useQuery({
    queryKey,
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
            <li key={member.id} className="grid gap-2 py-2">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words">{member.display_name}</span>
                <span className="text-muted-foreground text-sm capitalize">{member.role}</span>
              </div>
              {bar.role === "owner" && member.role !== "owner" && (
                <MemberActions
                  bar={bar}
                  member={member}
                  onChanged={() => client.invalidateQueries({ queryKey })}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MemberActions({
  bar,
  member,
  onChanged,
}: Readonly<{ bar: BarSummary; member: BarMember; onChanged: () => Promise<void> }>) {
  const [confirm, setConfirm] = useState(false);
  const endpoint = api.api.bars[":barId"].members[":id"];
  const param = { barId: bar.id, id: member.id };
  const nextRole = member.role === "viewer" ? "editor" : "viewer";
  const update = useMutation({
    mutationFn: async (json: UpdateBarMember) => unwrap(await endpoint.$patch({ param, json })),
    onSuccess: onChanged,
  });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-label={`Make ${member.display_name} ${nextRole}`}
          disabled={update.isPending}
          onClick={() => update.mutate({ role: nextRole })}
        >
          Make {nextRole}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Remove ${member.display_name}`}
          disabled={update.isPending}
          onClick={() => setConfirm(true)}
        >
          Remove
        </Button>
      </div>
      <FormError error={update.error} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Remove ${member.display_name}?`}
        description={`They will lose access to ${bar.name}. Their contributions will stay in the bar.`}
        confirmLabel="Remove member"
        onConfirm={async () => {
          await unwrap(await endpoint.$delete({ param }));
          await onChanged();
        }}
      />
    </>
  );
}
