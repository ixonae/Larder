import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createQueryClient } from "./api/query-client.ts";
import { App } from "./app.tsx";
import { applyTheme, readTheme } from "./components/theme.tsx";
import { createAppRouter } from "./routes/router.tsx";

applyTheme(readTheme());

const queryClient = createQueryClient();
const router = createAppRouter({ queryClient });

// biome-ignore lint/style/noNonNullAssertion: #root is in index.html
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App queryClient={queryClient} router={router} />
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/service-worker.js").catch((error: unknown) => {
    console.warn("Could not register Larder's service worker", error);
  });
}
