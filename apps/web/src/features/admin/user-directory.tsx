import { type AdminUser, type ResetUserPassword, resetUserPasswordSchema } from "@larder/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ellipsis } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { api, unwrap } from "@/api/client.ts";
import { badge } from "@/components/badge.ts";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import { FormError, PasswordField, useZodForm } from "@/lib/form.tsx";

export const adminUsersKey = ["administration", "users"];

const loginDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function UserDirectory({ users }: Readonly<{ users: AdminUser[] }>) {
  const client = useQueryClient();
  const change = useMutation({
    mutationFn: async ({ id, disabled }: Pick<AdminUser, "id" | "disabled">) =>
      unwrap(
        await api.api.admin.users[":id"].$patch({ param: { id }, json: { disabled: !disabled } }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: adminUsersKey }),
  });

  return (
    <div className="grid gap-3">
      <FormError error={change.error} />
      <ul className="divide-y rounded-xl border bg-card px-4 sm:px-5">
        {users.map((account) => (
          <li
            key={account.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium">{account.display_name}</p>
              <p className="break-all text-muted-foreground text-sm">{account.email}</p>
              <p className="mt-1 text-muted-foreground text-xs">
                {account.last_login_at ? (
                  <>
                    Last sign-in{" "}
                    <time dateTime={account.last_login_at}>
                      {loginDate.format(new Date(account.last_login_at))}
                    </time>
                  </>
                ) : (
                  "No recorded sign-in"
                )}
              </p>
            </div>
            {account.is_admin ? (
              <span className={badge({ tone: "muted" })}>Installation admin</span>
            ) : (
              <div className="flex items-center gap-2">
                <span className={badge({ tone: "muted" })}>
                  {account.disabled ? "Disabled" : "Active"}
                </span>
                <UserActions
                  account={account}
                  changing={change.isPending}
                  onChangeAccess={() => change.mutate(account)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const menuItem =
  "cursor-pointer rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50";

function UserActions({
  account,
  changing,
  onChangeAccess,
}: Readonly<{
  account: AdminUser;
  changing: boolean;
  onChangeAccess: () => void;
}>) {
  const [action, setAction] = useState<"reset" | "delete" | null>(null);
  const client = useQueryClient();
  const id = account.id;
  return (
    <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <Button variant="outline" size="icon-sm" aria-label={`Manage ${account.display_name}`}>
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
          >
            <DropdownMenu.Item className={menuItem} disabled={changing} onSelect={onChangeAccess}>
              {account.disabled ? "Enable account" : "Disable account"}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} onSelect={() => setAction("reset")}>
              Reset password
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={`${menuItem} text-destructive`}
              onSelect={() => setAction("delete")}
            >
              Delete account
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ConfirmDialog
        open={action === "delete"}
        onOpenChange={() => setAction(null)}
        title={`Delete ${account.display_name}?`}
        description="This permanently removes the account, its sessions, and its bar memberships."
        confirmLabel="Delete account"
        confirmationText={account.email}
        onConfirm={async (email) => {
          await unwrap(
            await api.api.admin.users[":id"].$delete({ param: { id }, json: { email } }),
          );
          await client.invalidateQueries({ queryKey: adminUsersKey });
        }}
      />
      {action === "reset" && (
        <ResetPasswordSheet account={account} onClose={() => setAction(null)} />
      )}
    </>
  );
}

function ResetPasswordSheet({
  account,
  onClose,
}: Readonly<{ account: AdminUser; onClose: () => void }>) {
  const form = useZodForm(resetUserPasswordSchema);
  const reset = useMutation({
    mutationFn: async (json: ResetUserPassword) =>
      unwrap(await api.api.admin.users[":id"].password.$patch({ param: { id: account.id }, json })),
    onSuccess: () => {
      toast(`Password reset for ${account.display_name}`);
      onClose();
    },
  });
  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>Reset password for {account.display_name}</SheetTitle>
          <SheetDescription>
            Set a new password and sign out all of this user’s sessions.
          </SheetDescription>
        </SheetHeader>
        <form
          className="grid gap-4 px-6 pb-6"
          noValidate
          onSubmit={form.handleSubmit((data) => reset.mutate(data))}
        >
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
          <FormError error={reset.error} />
          <Button disabled={reset.isPending} type="submit">
            Reset password
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
