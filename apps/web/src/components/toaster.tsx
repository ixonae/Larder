import { cn } from "cn";
import { X } from "lucide-react";
import { Toast } from "radix-ui";
import type { JSX } from "react";
import { useSyncExternalStore } from "react";

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: "default" | "error";
  /** A button in the toast, such as "Undo"; the toast closes once it is used. */
  action?: ToastAction | undefined;
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = (): void => {
  for (const listener of listeners) listener();
};

/** Shows a short notification. Works from anywhere (mutation callbacks included). */
export function toast(
  title: string,
  {
    description,
    variant = "default",
    action,
  }: { description?: string; variant?: ToastItem["variant"]; action?: ToastAction } = {},
): number {
  const id = nextId++;
  items = [...items, { id, title, description, variant, action }];
  emit();
  return id;
}

export function dismissToast(id: number): void {
  items = items.filter((t) => t.id !== id);
  emit();
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
    // Nobody shows toasts any more (the Toaster unmounted): drop the pending ones.
    if (listeners.size === 0) items = [];
  };
};

/** Renders the toasts; mount once near the root. Sits above the bottom navigation on phones. */
export function Toaster(): JSX.Element {
  const toasts = useSyncExternalStore(subscribe, () => items);
  return (
    <Toast.Provider swipeDirection="right" duration={5000}>
      {toasts.map((t) => (
        <Toast.Root
          key={t.id}
          type={t.variant === "error" ? "foreground" : "background"}
          // Toasts start open, so this only fires when one closes (timer, swipe or close button).
          onOpenChange={(): void => dismissToast(t.id)}
          className={cn(
            "flex items-start gap-3 rounded-lg border bg-background p-4 shadow-lg",
            t.variant === "error" && "border-destructive/50",
          )}
        >
          <div className="grid flex-1 gap-1">
            <Toast.Title
              className={cn("font-medium text-sm", t.variant === "error" && "text-destructive")}
            >
              {t.title}
            </Toast.Title>
            {t.description && (
              <Toast.Description className="text-muted-foreground text-sm">
                {t.description}
              </Toast.Description>
            )}
          </div>
          {t.action && (
            <Toast.Action altText={t.action.label} asChild>
              <button
                type="button"
                className="shrink-0 rounded-md border px-2 py-1 font-medium text-sm hover:bg-muted"
                onClick={t.action.onClick}
              >
                {t.action.label}
              </button>
            </Toast.Action>
          )}
          <Toast.Close aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
            <X className="size-4" aria-hidden />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed inset-x-4 bottom-20 z-50 flex flex-col gap-2 md:inset-x-auto md:right-4 md:bottom-4 md:w-96" />
    </Toast.Provider>
  );
}
