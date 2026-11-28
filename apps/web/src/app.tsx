import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { type JSX, useEffect, useState } from "react";
import { watchSession } from "./api/session.ts";
import { LoadingState } from "./components/states.tsx";
import { Toaster } from "./components/toaster.tsx";
import type { createAppRouter } from "./routes/router.tsx";

export function App({
  queryClient,
  router,
  restart,
}: Readonly<{
  queryClient: QueryClient;
  restart: () => void;
  router: ReturnType<typeof createAppRouter>;
}>): JSX.Element {
  const [ending, setEnding] = useState(false);
  useEffect(() => watchSession(queryClient, () => setEnding(true)), [queryClient]);
  useEffect(() => {
    if (ending) restart();
  }, [ending, restart]);
  // Unmount private screens and their toasts before the new document loads.
  if (ending) return <LoadingState />;
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  );
}
