import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  type RouterHistory,
  redirect,
} from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell.tsx";
import { NotFoundPage, SectionPage } from "@/components/section-page.tsx";
import { BottleDetailPage } from "@/features/bottles/bottle-detail-page.tsx";
import { BottlesPage, bottlesSearchSchema } from "@/features/bottles/bottles-page.tsx";
import { CategoriesPage } from "@/features/categories/categories-page.tsx";
import { UtensilsPage } from "@/features/utensils/utensils-page.tsx";

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

const section = <P extends string>(path: P, title: string, description: string) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => <SectionPage title={title} description={description} />,
  });

export const routeTree = rootRoute.addChildren([
  indexRoute,
  section("/cocktails", "Cocktails", "Your recipes will show up here."),
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
