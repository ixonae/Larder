import type { BarSummary, Me } from "@larder/shared";
import { useNavigate } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext } from "react";
import { useStoredState } from "@/lib/stored-state.ts";

type SignedIn = {
  me: Me;
  bar: BarSummary | undefined;
  enterBar: (id: string) => Promise<void>;
};

const ActiveBarContext = createContext<SignedIn | null>(null);

/** The signed-in user and their bar selection; null outside the signed-in shell. */
export const useActiveBar = () => useContext(ActiveBarContext);

/** For pages the router only mounts inside the signed-in shell. */
export function useSignedIn(): SignedIn {
  const signedIn = useContext(ActiveBarContext);
  if (!signedIn) throw new Error("useSignedIn is only available inside the signed-in shell");
  return signedIn;
}

export function ActiveBarProvider({ me, children }: Readonly<{ me: Me; children: ReactNode }>) {
  const [selected, select] = useStoredState(
    `larder.bar.${me.user.id}`,
    me.bars.map(({ id }) => id),
    "",
  );
  const bar = me.bars.find(({ id }) => id === selected) ?? me.bars[0];
  const navigate = useNavigate();
  const enterBar = (id: string) => {
    select(id);
    return navigate({ to: "/cocktails" });
  };
  return (
    <ActiveBarContext.Provider value={{ me, bar, enterBar }}>{children}</ActiveBarContext.Provider>
  );
}
