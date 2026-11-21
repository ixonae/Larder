import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type { JSX } from "react";
import { Toaster } from "./components/toaster.tsx";
import type { createAppRouter } from "./routes/router.tsx";

export function App({
  queryClient,
  router,
}: Readonly<{
  queryClient: QueryClient;
  router: ReturnType<typeof createAppRouter>;
}>): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  );
}
