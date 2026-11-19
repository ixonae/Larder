import { Link, Outlet } from "@tanstack/react-router";
import { FolderTree, Martini, UtensilsCrossed, Wine } from "lucide-react";
import { useMe } from "@/api/queries.ts";
import { ErrorState } from "./states.tsx";
import { ThemeToggle } from "./theme.tsx";

const NAV = [
  { to: "/cocktails", label: "Cocktails", icon: Martini },
  { to: "/bottles", label: "Bottles", icon: Wine },
  { to: "/categories", label: "Categories", icon: FolderTree },
  { to: "/utensils", label: "Utensils", icon: UtensilsCrossed },
] as const;

function NavLinks({ variant }: { variant: "side" | "bottom" }) {
  const base =
    variant === "side"
      ? "flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
      : "flex flex-col items-center gap-1 py-2 text-xs";
  return NAV.map(({ to, label, icon: Icon }) => (
    <Link
      key={to}
      to={to}
      className={`${base} text-muted-foreground`}
      activeProps={{ className: "text-foreground font-medium", "aria-current": "page" }}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </Link>
  ));
}

/** Mobile first: bottom tab bar on phones, sidebar from the `md` breakpoint. */
export function AppShell() {
  const me = useMe();
  const barName = me.data ? (me.data.bars[0]?.name ?? "No bar") : "";

  return (
    <div className="min-h-dvh bg-background text-foreground md:flex">
      <aside className="hidden border-r p-3 md:flex md:w-56 md:flex-col md:gap-4">
        <span className="px-3 pt-2 font-semibold text-lg">Larder</span>
        <nav aria-label="Sidebar" className="flex flex-col gap-1">
          <NavLinks variant="side" />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <span className="font-semibold md:hidden">Larder</span>
          <span className="truncate text-muted-foreground text-sm" data-testid="bar-name">
            {barName}
          </span>
          <ThemeToggle />
        </header>

        <main className="flex-1 px-4 py-6 pb-24 md:pb-6">
          {me.isError ? <ErrorState error={me.error} onRetry={() => me.refetch()} /> : <Outlet />}
        </main>
      </div>

      <nav
        aria-label="Bottom navigation"
        className="fixed inset-x-0 bottom-0 grid grid-cols-4 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <NavLinks variant="bottom" />
      </nav>
    </div>
  );
}
