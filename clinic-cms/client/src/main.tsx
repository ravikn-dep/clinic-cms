import "./authBootstrap";
import { trpc } from "@/lib/trpc";
import { getTrpcUrl } from "@/lib/trpcUrl";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl, isLoginPath } from "./const";

import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  const isHtmlApi = error.message.includes("HTML instead of JSON");

  if (!isUnauthorized && !isHtmlApi) return;

  if (typeof window !== "undefined" && isLoginPath(window.location.pathname)) {
    return;
  }

  window.location.replace(getLoginUrl());
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: getTrpcUrl(),
      transformer: superjson,
      async fetch(input, init) {
        const response = await globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });

        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("text/html")) {
          throw new TRPCClientError(
            "API returned HTML instead of JSON. On Manus, ensure the Node server is running (`pnpm dev` or `pnpm start`), not static files only. Check " +
              getTrpcUrl() +
              " in the browser Network tab."
          );
        }

        return response;
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
