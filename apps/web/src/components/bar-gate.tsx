import type { BarSummary } from "@larder/shared";
import type { ReactNode } from "react";
import { useMe } from "@/api/queries.ts";
import { EmptyState, LoadingState } from "./states.tsx";

/** Renders `children` with the current bar once it is known; until then, a titled loading or empty page. */
export function BarGate({
  title,
  children,
}: Readonly<{
  title: string;
  children: (bar: BarSummary) => ReactNode;
}>) {
  const me = useMe();
  const bar = me.data?.bars[0];
  if (bar) return children(bar);
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-3xl">{title}</h1>
      {me.data ? (
        <EmptyState title="No bar">You are not a member of any bar yet.</EmptyState>
      ) : (
        <LoadingState />
      )}
    </section>
  );
}
