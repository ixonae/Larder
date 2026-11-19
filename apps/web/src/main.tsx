import "./index.css";
import { QueryClient } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import { applyTheme, readTheme } from "./components/theme.tsx";
import { createAppRouter } from "./routes/router.tsx";

applyTheme(readTheme());

const queryClient = new QueryClient();
const router = createAppRouter({ queryClient });

// biome-ignore lint/style/noNonNullAssertion: #root is in index.html
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App queryClient={queryClient} router={router} />
  </StrictMode>,
);
