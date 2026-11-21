import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import type { JSX } from "react";
import { api, unwrap } from "@/api/client.ts";
import { showSignIn } from "@/api/query-client.ts";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";

export function SignOutButton(): JSX.Element {
  const client = useQueryClient();
  const signOut = useMutation({
    mutationFn: async () => unwrap(await api.api.auth["sign-out"].$post()),
    onSuccess: () => showSignIn(client),
    onError: (error: Error) =>
      toast("Could not sign out", { description: error.message, variant: "error" }),
  });

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Sign out"
      title="Sign out"
      disabled={signOut.isPending}
      onClick={(): void => signOut.mutate()}
    >
      <LogOut className="size-5" aria-hidden />
    </Button>
  );
}
