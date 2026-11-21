import { Link } from "@tanstack/react-router";
import type { JSX } from "react";

const tab =
  "flex-1 rounded-md px-3 py-1.5 text-center font-medium text-sm transition-colors sm:flex-none";

/** Bottles | Tastings, at the top of the Bottles section: tastings are reached from here on phones. */
export function BottlesTabs(): JSX.Element {
  return (
    <nav aria-label="Bottles section" className="flex w-full rounded-lg bg-muted p-1 sm:w-fit">
      {(
        [
          ["/bottles", "Bottles"],
          ["/tastings", "Tastings"],
        ] as const
      ).map(([to, label]) => (
        <Link
          key={to}
          to={to}
          className={tab}
          activeOptions={{ exact: true, includeSearch: false }}
          activeProps={{ className: "bg-background shadow-xs", "aria-current": "page" }}
          inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
