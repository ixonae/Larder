import { Link, Outlet, useLocation, useMatches } from "@tanstack/react-router";
import { cn } from "cn";
import {
  CircleUserRound,
  Citrus,
  FolderTree,
  Martini,
  NotebookPen,
  ShieldCheck,
  UtensilsCrossed,
  Wine,
} from "lucide-react";
import { Fragment } from "react";
import { useMe } from "@/api/queries.ts";
import { SignInForm } from "@/features/account/sign-in.tsx";
import { SignOutButton } from "@/features/account/sign-out.tsx";
import { SignUpLink } from "@/features/account/sign-up.tsx";
import { ActiveBarProvider, useActiveBar } from "@/features/bars/active-bar.tsx";
import { ErrorState, LoadingState } from "./states.tsx";
import { ThemeToggle } from "./theme.tsx";

/**
 * `sideOnly` entries stay out of the phone's bottom bar, which keeps five tabs: Tastings is reached
 * from the tabs at the top of Bottles there, and Bottles stays highlighted while it is open.
 */
const NAV = [
  { to: "/cocktails", label: "Cocktails", icon: Martini },
  { to: "/bottles", label: "Bottles", icon: Wine },
  { to: "/tastings", label: "Tastings", icon: NotebookPen, sideOnly: true },
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
  const inTastings = useLocation({ select: (l) => l.pathname.startsWith("/tastings") });
  const items = NAV.filter((item) => variant === "side" || !("sideOnly" in item));
  return items.map(({ to, label, icon: Icon }) => {
    const activeProps = { className: active, "aria-current": "page" } as const;
    // On a phone, Tastings belongs to the Bottles tab.
    const forced = variant === "bottom" && to === "/bottles" && inTastings;
    return (
      <Link
        key={to}
        to={to}
        className={base}
        inactiveProps={
          forced ? activeProps : { className: "text-muted-foreground hover:text-foreground" }
        }
        activeProps={activeProps}
      >
        <Icon className="size-5" aria-hidden />
        {label}
      </Link>
    );
  });
}

function Brand({ className }: Readonly<{ className?: string }>) {
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
  const publicPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.public),
  });
  if (me.isPending) return <LoadingState />;
  if (me.isLoadingError) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  if (me.data === null) {
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-sm content-center gap-6 px-5 py-8">
        <Brand />
        {publicPage ? (
          <Outlet />
        ) : (
          <>
            <h1 className="text-3xl">Sign in</h1>
            <SignInForm />
            <SignUpLink />
          </>
        )}
      </main>
    );
  }
  return (
    <ActiveBarProvider key={me.data.user.id} me={me.data}>
      <SignedInLayout
        isAdmin={me.data.user.is_admin}
        error={me.error}
        onRetry={() => me.refetch()}
      />
    </ActiveBarProvider>
  );
}

function SignedInLayout({
  isAdmin,
  error,
  onRetry,
}: Readonly<{ isAdmin: boolean; error: Error | null; onRetry: () => void }>) {
  const bar = useActiveBar()?.bar;
  return (
    <div className="min-h-dvh bg-background text-foreground md:flex">
      <aside className="sticky top-0 hidden h-dvh border-sidebar-border border-r bg-sidebar p-3 md:flex md:w-60 md:shrink-0 md:flex-col md:gap-6">
        <Brand className="px-2 pt-2" />
        <nav aria-label="Sidebar" className="flex flex-col gap-1">
          <NavLinks variant="side" />
        </nav>
        <nav
          aria-label="Account navigation"
          className="mt-auto grid gap-1 border-sidebar-border border-t pt-3"
        >
          <AccountLink to="/settings" icon={CircleUserRound} label="Account" />
          {isAdmin && <AccountLink to="/admin" icon={ShieldCheck} label="Administration" />}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b bg-background/85 px-4 backdrop-blur md:px-8">
          <Brand className="md:hidden" />
          <Link
            to="/bars"
            aria-label="Manage bars"
            className="min-w-0 truncate rounded-full border bg-card px-3 py-1 text-muted-foreground text-xs hover:text-foreground md:text-sm"
            data-testid="bar-name"
          >
            {bar?.name ?? "No bar"}
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              to="/settings"
              aria-label="Account settings"
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
            >
              <CircleUserRound className="size-5" aria-hidden />
            </Link>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:py-8">
          {error && <ErrorState error={error} onRetry={onRetry} />}
          <Fragment key={bar?.id}>
            <Outlet />
          </Fragment>
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

function AccountLink({
  to,
  icon: Icon,
  label,
}: Readonly<{
  to: "/settings" | "/admin";
  icon: typeof CircleUserRound;
  label: string;
}>) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent/60"
      activeProps={{
        className: "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
        "aria-current": "page",
      }}
      inactiveProps={{ className: "text-muted-foreground" }}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </Link>
  );
}
