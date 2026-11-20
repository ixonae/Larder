import { COCKTAIL_SORTS, listCocktailsQuerySchema } from "@larder/shared";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  type RouterHistory,
  redirect,
} from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/components/app-shell.tsx";
import { NotFoundPage } from "@/components/section-page.tsx";
import { SettingsPage } from "@/features/account/settings-page.tsx";
import { SignUpPage } from "@/features/account/sign-up.tsx";
import { AdminPage } from "@/features/admin/admin-page.tsx";
import { BarsPage } from "@/features/bars/bars-page.tsx";
import { InvitePage } from "@/features/bars/invite-page.tsx";
import { BottleDetailPage } from "@/features/bottles/bottle-detail-page.tsx";
import { BottlesPage, bottlesSearchSchema } from "@/features/bottles/bottles-page.tsx";
import { CategoriesPage } from "@/features/categories/categories-page.tsx";
import { CocktailDetailPage } from "@/features/cocktails/cocktail-detail-page.tsx";
import { EditCocktailPage, NewCocktailPage } from "@/features/cocktails/cocktail-editor-page.tsx";
import { CocktailsPage } from "@/features/cocktails/cocktails-page.tsx";
import { PantryPage } from "@/features/pantry/pantry-page.tsx";
import { UtensilsPage } from "@/features/utensils/utensils-page.tsx";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** Also shown to signed-out visitors, instead of the sign-in form. */
    public?: boolean;
  }
}

export interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/cocktails" });
  },
});

const filters = listCocktailsQuerySchema.shape;
const cocktailsSearchSchema = z.object({
  q: z.string().max(100).optional().catch(undefined),
  spirit: filters.spirit.catch(undefined),
  glass_id: filters.glass_id.catch(undefined),
  method: filters.method.catch(undefined),
  tag: filters.tag.catch(undefined),
  missing: z.number().int().nonnegative().optional().catch(undefined),
  sort: z.enum(COCKTAIL_SORTS).optional().catch(undefined),
  // Only `true` filters; `false` means the same as leaving it out.
  favourite: z
    .boolean()
    .optional()
    .catch(undefined)
    .transform((value: boolean | undefined): true | undefined => value || undefined),
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/signup",
    component: SignUpPage,
    staticData: { public: true },
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/admin", component: AdminPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/bars", component: BarsPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/invite",
    component: InvitePage,
    staticData: { public: true },
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/cocktails",
    validateSearch: cocktailsSearchSchema,
    component: CocktailsPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/cocktails/$cocktailId",
    validateSearch: cocktailsSearchSchema,
    component: CocktailDetailPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/cocktails/new",
    validateSearch: cocktailsSearchSchema,
    component: NewCocktailPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/cocktails/$cocktailId/edit",
    validateSearch: cocktailsSearchSchema,
    component: EditCocktailPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/bottles",
    validateSearch: bottlesSearchSchema,
    component: BottlesPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/bottles/$productId",
    component: BottleDetailPage,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/pantry", component: PantryPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/categories", component: CategoriesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/utensils", component: UtensilsPage }),
]);

export function createAppRouter(context: RouterContext, history?: RouterHistory) {
  return createRouter({ routeTree, context, ...(history && { history }) });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
