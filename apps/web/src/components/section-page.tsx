import type { JSX } from "react";
import { EmptyState } from "./states.tsx";

/** Placeholder page for sections that later steps fill in. */
export function SectionPage({
  title,
  description,
}: Readonly<{ title: string; description: string }>): JSX.Element {
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-3xl">{title}</h1>
      <EmptyState title="Nothing here yet">{description}</EmptyState>
    </section>
  );
}

export function NotFoundPage(): JSX.Element {
  return <SectionPage title="Page not found" description="This page does not exist." />;
}
