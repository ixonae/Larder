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
  section("/bottles", "Bottles", "Your bottles will show up here."),
  section("/categories", "Categories", "Ingredient categories will show up here."),
  section("/utensils", "Utensils", "Your glasses and tools will show up here."),
]);

export function createAppRouter(context: RouterContext, history?: RouterHistory) {
  return createRouter({ routeTree, context, ...(history && { history }) });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
