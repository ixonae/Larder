import { EmptyState } from "./states.tsx";

/** Placeholder page for sections that later steps fill in. */
export function SectionPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="font-semibold text-2xl">{title}</h1>
      <EmptyState title="Nothing here yet">{description}</EmptyState>
    </section>
  );
}

export function NotFoundPage() {
  return <SectionPage title="Page not found" description="This page does not exist." />;
}
