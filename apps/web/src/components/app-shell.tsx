import { Link, Outlet } from "@tanstack/react-router";
import { cn } from "cn";
import { Citrus, FolderTree, Martini, UtensilsCrossed, Wine } from "lucide-react";
import { useMe } from "@/api/queries.ts";
import { ErrorState } from "./states.tsx";
import { ThemeToggle } from "./theme.tsx";

const NAV = [
  { to: "/cocktails", label: "Cocktails", icon: Martini },
  { to: "/bottles", label: "Bottles", icon: Wine },
  { to: "/pantry", label: "Pantry", icon: Citrus },
  { to: "/utensils", label: "Utensils", icon: UtensilsCrossed },
  { to: "/categories", label: "Categories", icon: FolderTree },
] as const;

function NavLinks({ variant }: { variant: "side" | "bottom" }) {
  const base =
    variant === "side"
      ? "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent/60"
      : "group flex flex-col items-center gap-1 py-2 text-[11px] transition-colors";
  // Separate inactive/active classes: with both on the element, CSS order (not class order) wins.
  const active =
    variant === "side"
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium [&>svg]:text-brand"
      : "text-brand font-medium";
  return NAV.map(({ to, label, icon: Icon }) => (
    <Link
      key={to}
      to={to}
      className={base}
      inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
      activeProps={{ className: active, "aria-current": "page" }}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </Link>
  ));
}

function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-sm">
        <Martini className="size-4.5" aria-hidden />
      </span>
      <span className="font-semibold text-lg tracking-tight">Larder</span>
    </span>
  );
}

/** Mobile first: bottom tab bar on phones, sidebar from the `md` breakpoint. */
export function AppShell() {
  const me = useMe();
  const barName = me.data ? (me.data.bars[0]?.name ?? "No bar") : "";

  return (
    <div className="min-h-dvh bg-background text-foreground md:flex">
      <aside className="sticky top-0 hidden h-dvh border-sidebar-border border-r bg-sidebar p-3 md:flex md:w-60 md:shrink-0 md:flex-col md:gap-6">
        <Brand className="px-2 pt-2" />
        <nav aria-label="Sidebar" className="flex flex-col gap-1">
          <NavLinks variant="side" />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b bg-background/85 px-4 backdrop-blur md:px-8">
          <Brand className="md:hidden" />
          <span
            className="truncate rounded-full border bg-card px-3 py-1 text-muted-foreground text-xs empty:hidden md:text-sm"
            data-testid="bar-name"
          >
            {barName}
          </span>
          <ThemeToggle />
        </header>

        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:py-8">
          {me.isError && <ErrorState error={me.error} onRetry={() => me.refetch()} />}
          {!me.isLoadingError && <Outlet />}
        </main>
      </div>

      <nav
        aria-label="Bottom navigation"
        className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t bg-background/90 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <NavLinks variant="bottom" />
      </nav>
    </div>
  );
}
