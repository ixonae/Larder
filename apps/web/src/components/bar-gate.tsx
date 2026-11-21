import type { BarSummary } from "@larder/shared";
import type { ReactNode } from "react";
import { useActiveBar } from "@/features/bars/active-bar.tsx";
import { EmptyState } from "./states.tsx";

export function BarGate({
  title,
  children,
}: Readonly<{
  title: string;
  children: (bar: BarSummary) => ReactNode;
}>): ReactNode {
  const bar = useActiveBar()?.bar;
  if (bar) return children(bar);
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-3xl">{title}</h1>
      <EmptyState title="No bar">You are not a member of any bar yet.</EmptyState>
    </section>
  );
}
