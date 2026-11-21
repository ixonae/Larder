import { CircleAlert, LoaderCircle } from "lucide-react";
import type { JSX, ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  children,
}: Readonly<{ title: string; children?: ReactNode }>): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card/50 p-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="text-muted-foreground text-sm">{children}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: Readonly<{ error: Error; onRetry: () => void }>): JSX.Element {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 p-8 text-center"
    >
      <CircleAlert className="size-6 text-destructive" aria-hidden />
      <p className="font-medium">Something went wrong</p>
      <p className="text-muted-foreground text-sm">{error.message}</p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: Readonly<{ label?: string }>): JSX.Element {
  return (
    <output className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </output>
  );
}
