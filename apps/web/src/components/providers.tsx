"use client";

import { isServer, type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import { makeQueryClient } from "@/lib/query-client";

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

// Keep these context values the same after hydration. A change here makes React drop the server
// HTML of any streamed Suspense boundary it has not revealed yet and render it again on the client.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <NuqsAdapter>
      <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
    </NuqsAdapter>
  );
}
